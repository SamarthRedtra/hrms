import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, format_datetime, get_datetime, get_link_to_form

from hrms.hr.utils import notify_bulk_action_status, validate_bulk_tool_fields


class BulkEmployeeChekin(Document):
	@frappe.whitelist()
	def get_employees(self, advanced_filters: list | None = None) -> list:
		if not advanced_filters:
			advanced_filters = []

		if not self.get("date"):
			frappe.throw(_("Date is required to fetch employees."))

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
		employees = query.run(as_dict=True)
		if not employees:
			return []

		start = get_datetime(self.date)
		end = add_days(start, 1)
		employee_ids = [emp["employee"] for emp in employees]

		checkins = frappe.get_all(
			"Employee Checkin",
			fields=["name", "employee", "log_type", "time", "project"],
			filters={"employee": ["in", employee_ids], "time": ["between", [start, end]]},
			order_by="time asc",
		)

		checkin_map = {}
		for row in checkins:
			entry = checkin_map.setdefault(
				row.employee,
				{
					"in_time": None,
					"out_time": None,
					"in_project": None,
					"out_project": None,
					"in_checkin": None,
					"out_checkin": None,
				},
			)
			if row.log_type == "IN":
				if not entry["in_time"] or row.time < entry["in_time"]:
					entry["in_time"] = row.time
					entry["in_project"] = row.project
					entry["in_checkin"] = row.name
			elif row.log_type == "OUT":
				if not entry["out_time"] or row.time > entry["out_time"]:
					entry["out_time"] = row.time
					entry["out_project"] = row.project
					entry["out_checkin"] = row.name

		for emp in employees:
			entry = checkin_map.get(emp["employee"], {})
			emp["in_time"] = format_datetime(entry.get("in_time"), "HH:mm:ss") if entry.get("in_time") else None
			emp["out_time"] = (
				format_datetime(entry.get("out_time"), "HH:mm:ss") if entry.get("out_time") else None
			)
			emp["in_project"] = entry.get("in_project")
			emp["out_project"] = entry.get("out_project")
			emp["in_checkin"] = entry.get("in_checkin")
			emp["out_checkin"] = entry.get("out_checkin")

		return employees

	@frappe.whitelist()
	def bulk_create_checkins(self, employees: list, log_type: str | None = None, time: str | None = None, device_id: str | None = None, latitude: float | None = None, longitude: float | None = None, skip_auto_attendance: int | None = None, project: str | None = None) -> None:
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
			project=project,
		)

	def _bulk_create_checkins(self, employees: list, log_type: str | None = None, time: str | None = None, device_id: str | None = None, latitude: float | None = None, longitude: float | None = None, skip_auto_attendance: int | None = None , project: str | None = None) -> None:
		success, failure = [], []
		count = 0
		savepoint = "before_checkin_insert"
		project_required = frappe.db.get_single_value("Payroll Settings", "project_mandatory_for_checkin")

		for employee in employees:
			if project_required and not (project or getattr(self, "project", None)):
				failure.append(employee if isinstance(employee, str) else employee.get("employee"))
				continue

			try:
				frappe.db.savepoint(savepoint)
				doc = frappe.new_doc("Employee Checkin")
				doc.employee = employee if isinstance(employee, str) else employee.get("employee")
				# use provided values if present, otherwise safe fallbacks from this single doctype
				doc.time = time or getattr(self, "time", frappe.utils.now_datetime())
				doc.device_id = device_id or getattr(self, "device_id", None)
				doc.log_type = log_type or getattr(self, "log_type", None)
				doc.project = project or getattr(self, "project", None)
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
