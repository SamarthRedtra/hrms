import frappe
from frappe import _
from frappe.model.document import Document
from frappe.query_builder.custom import ConstantColumn
from frappe.query_builder.functions import Coalesce
from frappe.query_builder.terms import SubQuery
from frappe.utils import get_link_to_form

from hrms.hr.utils import validate_bulk_tool_fields, notify_bulk_action_status


class BulkEmployeeChekin(Document):
	@frappe.whitelist()
	def get_employees(self, advanced_filters: list | None = None) -> list:
		if not advanced_filters:
			advanced_filters = []
		# default company if missing
		if not self.get("company"):
			default_company = frappe.defaults.get_default("company")
			if default_company:
				self.company = default_company

		quick_filter_fields = [
			"company",
			"employment_type",
			"branch",
			"department",
			"designation",
			"grade",
		]
		filters = [[d, "=", self.get(d)] for d in quick_filter_fields if self.get(d)]
		filters += advanced_filters

		Employee = frappe.qb.DocType("Employee")
		query = (
			frappe.qb.get_query(
				Employee,
				fields=[
					Employee.employee,
					Employee.employee_name,
					Employee.branch,
					Employee.department,
				],
				filters=filters,
			)
			.where((Employee.status == "Active"))
		)
		return query.run(as_dict=True)

	@frappe.whitelist()
	def bulk_create_checkins(self, employees: list, log_type: str | None = None, time: str | None = None, device_id: str | None = None, latitude: float | None = None, longitude: float | None = None, skip_auto_attendance: int | None = None) -> None:
		# Only company and at least one employee are mandatory here; type/time can be provided via dialog
		validate_bulk_tool_fields(self, ["company"], employees)

		# For large batches, queue
		if len(employees) > 30:
			frappe.enqueue(
				self._bulk_create_checkins,
				timeout=3000,
				employees=employees,
				log_type=log_type,
				time=time,
				device_id=device_id,
				latitude=latitude,
				longitude=longitude,
				skip_auto_attendance=skip_auto_attendance,
			)
			frappe.msgprint(
				_("Creation of Employee Checkins has been queued. It may take a few minutes."),
				alert=True,
				indicator="blue",
			)
			return

		self._bulk_create_checkins(
			employees,
			log_type=log_type,
			time=time,
			device_id=device_id,
			latitude=latitude,
			longitude=longitude,
			skip_auto_attendance=skip_auto_attendance,
		)

	def _bulk_create_checkins(self, employees: list, log_type: str | None = None, time: str | None = None, device_id: str | None = None, latitude: float | None = None, longitude: float | None = None, skip_auto_attendance: int | None = None) -> None:
		success, failure = [], []
		count = 0
		savepoint = "before_checkin_insert"

		for employee in employees:
			try:
				frappe.db.savepoint(savepoint)
				doc = frappe.new_doc("Employee Checkin")
				doc.employee = employee if isinstance(employee, str) else employee.get("employee")
				# use provided values if present, otherwise safe fallbacks from this single doctype
				doc.time = time or getattr(self, "time", frappe.utils.now_datetime())
				doc.device_id = device_id or getattr(self, "device_id", None)
				doc.log_type = log_type or getattr(self, "log_type", None)
				doc.latitude = latitude if latitude is not None else getattr(self, "latitude", None)
				doc.longitude = longitude if longitude is not None else getattr(self, "longitude", None)
				if frappe.utils.cint(skip_auto_attendance if skip_auto_attendance is not None else getattr(self, "skip_auto_attendance", 0)) == 1:
					doc.skip_auto_attendance = 1
				doc.insert()
			except Exception:
				frappe.db.rollback(save_point=savepoint)
				frappe.log_error(
					f"Bulk Employee Checkin failed for employee {employee}.",
					reference_doctype="Employee Checkin",
				)
				failure.append(employee if isinstance(employee, str) else employee.get("employee"))
			else:
				success.append(
					{
						"doc": get_link_to_form("Employee Checkin", doc.name),
						"employee": doc.employee,
					}
				)

			count += 1
			frappe.publish_progress(count * 100 / len(employees), title=_("Creating Checkins..."))

		# Show desktop notification with summary
		notify_bulk_action_status("Employee Checkin", failure, [d["employee"] for d in success])

		# Realtime event for client to consume
		frappe.publish_realtime(
			"completed_bulk_employee_checkin",
			message={"success": success, "failure": failure},
			doctype="Bulk Employee Checkin",
			after_commit=True,
		)


