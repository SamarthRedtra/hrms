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

		# Process advanced filters - add doctype prefix if missing
		for adv_filter in advanced_filters:
			if len(adv_filter) == 3:
				# Format: [fieldname, condition, value] -> add doctype
				filters.append(["Employee"] + adv_filter)
			else:
				# Already has doctype or different format
				filters.append(adv_filter)

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
					"in_times": [],
					"out_times": [],
					"in_projects": [],
					"out_projects": [],
					"in_checkins": [],
					"out_checkins": [],
				},
			)
			if row.log_type == "IN":
				entry["in_times"].append(row.time)
				entry["in_projects"].append(row.project)
				entry["in_checkins"].append(row.name)
			elif row.log_type == "OUT":
				entry["out_times"].append(row.time)
				entry["out_projects"].append(row.project)
				entry["out_checkins"].append(row.name)

		for emp in employees:
			entry = checkin_map.get(emp["employee"], {})

			# Get first IN/OUT pair
			in_times = entry.get("in_times", [])
			out_times = entry.get("out_times", [])
			in_projects = entry.get("in_projects", [])
			out_projects = entry.get("out_projects", [])
			in_checkins = entry.get("in_checkins", [])
			out_checkins = entry.get("out_checkins", [])

			# For backward compatibility, show first IN and last OUT
			if in_times:
				emp["in_time"] = format_datetime(in_times[0], "HH:mm:ss")
				emp["in_project"] = in_projects[0] if in_projects else None
				emp["in_checkin"] = in_checkins[0] if in_checkins else None

			if out_times:
				emp["out_time"] = format_datetime(out_times[-1], "HH:mm:ss")  # Last OUT
				emp["out_project"] = out_projects[-1] if out_projects else None
				emp["out_checkin"] = out_checkins[-1] if out_checkins else None

			# Add additional fields for multiple checkins
			emp["checkin_count"] = len(in_times) + len(out_times)
			emp["has_multiple_sessions"] = len(in_times) > 1 or len(out_times) > 1

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

	def _bulk_create_in_out_checkins_twice(
		self,
		employees: list,
		first_in_time: str,
		first_out_time: str,
		second_in_time: str,
		second_out_time: str,
		device_id: str | None = None,
		latitude: float | None = None,
		longitude: float | None = None,
		skip_auto_attendance: int | None = None,
		project: str | None = None,
	) -> None:
		"""Internal method to create both IN and OUT checkins twice for employees."""
		success, failure = [], []
		count = 0
		savepoint = "before_in_out_checkin_twice_insert"
		project_required = frappe.db.get_single_value("Payroll Settings", "project_mandatory_for_checkin")

		first_in_dt = get_datetime(first_in_time)
		first_out_dt = get_datetime(first_out_time)
		second_in_dt = get_datetime(second_in_time)
		second_out_dt = get_datetime(second_out_time)

		for employee in employees:
			emp_id = employee if isinstance(employee, str) else employee.get("employee")

			if project_required and not (project or getattr(self, "project", None)):
				failure.append(emp_id)
				continue

			try:
				frappe.db.savepoint(savepoint)

				# Create First IN checkin
				first_in_doc = frappe.new_doc("Employee Checkin")
				first_in_doc.employee = emp_id
				first_in_doc.time = first_in_dt
				first_in_doc.device_id = device_id or getattr(self, "device_id", None)
				first_in_doc.log_type = "IN"
				first_in_doc.project = project or getattr(self, "project", None)
				first_in_doc.latitude = latitude if latitude is not None else getattr(self, "latitude", None)
				first_in_doc.longitude = longitude if longitude is not None else getattr(self, "longitude", None)
				if frappe.utils.cint(skip_auto_attendance if skip_auto_attendance is not None else getattr(self, "skip_auto_attendance", 0)) == 1:
					first_in_doc.skip_auto_attendance = 1
				first_in_doc.insert()

				# Create First OUT checkin
				first_out_doc = frappe.new_doc("Employee Checkin")
				first_out_doc.employee = emp_id
				first_out_doc.time = first_out_dt
				first_out_doc.device_id = device_id or getattr(self, "device_id", None)
				first_out_doc.log_type = "OUT"
				first_out_doc.project = project or getattr(self, "project", None)
				first_out_doc.latitude = latitude if latitude is not None else getattr(self, "latitude", None)
				first_out_doc.longitude = longitude if longitude is not None else getattr(self, "longitude", None)
				if frappe.utils.cint(skip_auto_attendance if skip_auto_attendance is not None else getattr(self, "skip_auto_attendance", 0)) == 1:
					first_out_doc.skip_auto_attendance = 1
				first_out_doc.insert()

				# Create Second IN checkin
				second_in_doc = frappe.new_doc("Employee Checkin")
				second_in_doc.employee = emp_id
				second_in_doc.time = second_in_dt
				second_in_doc.device_id = device_id or getattr(self, "device_id", None)
				second_in_doc.log_type = "IN"
				second_in_doc.project = project or getattr(self, "project", None)
				second_in_doc.latitude = latitude if latitude is not None else getattr(self, "latitude", None)
				second_in_doc.longitude = longitude if longitude is not None else getattr(self, "longitude", None)
				if frappe.utils.cint(skip_auto_attendance if skip_auto_attendance is not None else getattr(self, "skip_auto_attendance", 0)) == 1:
					second_in_doc.skip_auto_attendance = 1
				second_in_doc.insert()

				# Create Second OUT checkin
				second_out_doc = frappe.new_doc("Employee Checkin")
				second_out_doc.employee = emp_id
				second_out_doc.time = second_out_dt
				second_out_doc.device_id = device_id or getattr(self, "device_id", None)
				second_out_doc.log_type = "OUT"
				second_out_doc.project = project or getattr(self, "project", None)
				second_out_doc.latitude = latitude if latitude is not None else getattr(self, "latitude", None)
				second_out_doc.longitude = longitude if longitude is not None else getattr(self, "longitude", None)
				if frappe.utils.cint(skip_auto_attendance if skip_auto_attendance is not None else getattr(self, "skip_auto_attendance", 0)) == 1:
					second_out_doc.skip_auto_attendance = 1
				second_out_doc.insert()

			except Exception:
				frappe.db.rollback(save_point=savepoint)
				frappe.log_error(
					f"Bulk IN/OUT Checkin (Twice) failed for employee {emp_id}.",
					reference_doctype="Employee Checkin",
				)
				failure.append(emp_id)
			else:
				success.append(
					{
						"doc": f"{get_link_to_form('Employee Checkin', first_in_doc.name)} / {get_link_to_form('Employee Checkin', first_out_doc.name)} / {get_link_to_form('Employee Checkin', second_in_doc.name)} / {get_link_to_form('Employee Checkin', second_out_doc.name)}",
						"employee": emp_id,
					}
				)

			count += 1
			frappe.publish_progress(count * 100 / len(employees), title=_("Creating IN & OUT Checkins (Twice)..."))

		# Show desktop notification with summary
		notify_bulk_action_status("Employee Checkin", failure, [d["employee"] for d in success])

		# Realtime event for client to consume
		frappe.publish_realtime(
			"completed_bulk_employee_checkin",
			message={"success": success, "failure": failure},
			doctype="Bulk Employee Checkin",
			after_commit=True,
		)
	@frappe.whitelist()
	def bulk_create_in_out_checkins(
		self,
		employees: list,
		in_time: str,
		out_time: str,
		device_id: str | None = None,
		latitude: float | None = None,
		longitude: float | None = None,
		skip_auto_attendance: int | None = None,
		project: str | None = None,
	) -> None:
		"""Creates both IN and OUT checkin entries for multiple employees at once."""
		from hrms.hr.utils import validate_bulk_tool_fields

		validate_bulk_tool_fields(self, ["company"], employees)

		if not in_time or not out_time:
			frappe.throw(_("Both IN time and OUT time are required."))

		in_datetime = get_datetime(in_time)
		out_datetime = get_datetime(out_time)

		if out_datetime <= in_datetime:
			frappe.throw(_("OUT time must be after IN time."))

		# For large batches, queue
		if len(employees) > 30:
			frappe.enqueue(
				self._bulk_create_in_out_checkins,
				timeout=3000,
				employees=employees,
				in_time=in_time,
				out_time=out_time,
				device_id=device_id,
				latitude=latitude,
				longitude=longitude,
				skip_auto_attendance=skip_auto_attendance,
				project=project,
			)
			frappe.msgprint(
				_("Creation of IN & OUT Checkins has been queued. It may take a few minutes."),
				alert=True,
				indicator="blue",
			)
			return

		self._bulk_create_in_out_checkins(
			employees,
			in_time=in_time,
			out_time=out_time,
			device_id=device_id,
			latitude=latitude,
			longitude=longitude,
			skip_auto_attendance=skip_auto_attendance,
			project=project,
		)

	@frappe.whitelist()
	def bulk_create_in_out_checkins_twice(
		self,
		employees: list,
		first_in_time: str,
		first_out_time: str,
		second_in_time: str,
		second_out_time: str,
		device_id: str | None = None,
		latitude: float | None = None,
		longitude: float | None = None,
		skip_auto_attendance: int | None = None,
		project: str | None = None,
	) -> None:
		"""Creates IN and OUT checkin entries twice for the same day for multiple employees."""
		from hrms.hr.utils import validate_bulk_tool_fields

		validate_bulk_tool_fields(self, ["company"], employees)

		if not all([first_in_time, first_out_time, second_in_time, second_out_time]):
			frappe.throw(_("All four time fields (First IN, First OUT, Second IN, Second OUT) are required."))

		first_in_dt = get_datetime(first_in_time)
		first_out_dt = get_datetime(first_out_time)
		second_in_dt = get_datetime(second_in_time)
		second_out_dt = get_datetime(second_out_time)

		if first_out_dt <= first_in_dt:
			frappe.throw(_("First OUT time must be after First IN time."))

		if second_out_dt <= second_in_dt:
			frappe.throw(_("Second OUT time must be after Second IN time."))

		if second_in_dt <= first_out_dt:
			frappe.throw(_("Second IN time must be after First OUT time."))

		# For large batches, queue
		if len(employees) > 30:
			frappe.enqueue(
				self._bulk_create_in_out_checkins_twice,
				timeout=3000,
				employees=employees,
				first_in_time=first_in_time,
				first_out_time=first_out_time,
				second_in_time=second_in_time,
				second_out_time=second_out_time,
				device_id=device_id,
				latitude=latitude,
				longitude=longitude,
				skip_auto_attendance=skip_auto_attendance,
				project=project,
			)
			frappe.msgprint(
				_("Creation of IN & OUT Checkins (Twice) has been queued. It may take a few minutes."),
				alert=True,
				indicator="blue",
			)
			return

		self._bulk_create_in_out_checkins_twice(
			employees,
			first_in_time=first_in_time,
			first_out_time=first_out_time,
			second_in_time=second_in_time,
			second_out_time=second_out_time,
			device_id=device_id,
			latitude=latitude,
			longitude=longitude,
			skip_auto_attendance=skip_auto_attendance,
			project=project,
		)

	def _bulk_create_in_out_checkins(
		self,
		employees: list,
		in_time: str,
		out_time: str,
		device_id: str | None = None,
		latitude: float | None = None,
		longitude: float | None = None,
		skip_auto_attendance: int | None = None,
		project: str | None = None,
	) -> None:
		"""Internal method to create both IN and OUT checkins for employees."""
		success, failure = [], []
		count = 0
		savepoint = "before_in_out_checkin_insert"
		project_required = frappe.db.get_single_value("Payroll Settings", "project_mandatory_for_checkin")

		in_datetime = get_datetime(in_time)
		out_datetime = get_datetime(out_time)

		for employee in employees:
			emp_id = employee if isinstance(employee, str) else employee.get("employee")

			if project_required and not (project or getattr(self, "project", None)):
				failure.append(emp_id)
				continue

			try:
				frappe.db.savepoint(savepoint)

				# Create IN checkin
				in_doc = frappe.new_doc("Employee Checkin")
				in_doc.employee = emp_id
				in_doc.time = in_datetime
				in_doc.device_id = device_id or getattr(self, "device_id", None)
				in_doc.log_type = "IN"
				in_doc.project = project or getattr(self, "project", None)
				in_doc.latitude = latitude if latitude is not None else getattr(self, "latitude", None)
				in_doc.longitude = longitude if longitude is not None else getattr(self, "longitude", None)
				if frappe.utils.cint(skip_auto_attendance if skip_auto_attendance is not None else getattr(self, "skip_auto_attendance", 0)) == 1:
					in_doc.skip_auto_attendance = 1
				in_doc.insert()

				# Create OUT checkin
				out_doc = frappe.new_doc("Employee Checkin")
				out_doc.employee = emp_id
				out_doc.time = out_datetime
				out_doc.device_id = device_id or getattr(self, "device_id", None)
				out_doc.log_type = "OUT"
				out_doc.project = project or getattr(self, "project", None)
				out_doc.latitude = latitude if latitude is not None else getattr(self, "latitude", None)
				out_doc.longitude = longitude if longitude is not None else getattr(self, "longitude", None)
				if frappe.utils.cint(skip_auto_attendance if skip_auto_attendance is not None else getattr(self, "skip_auto_attendance", 0)) == 1:
					out_doc.skip_auto_attendance = 1
				out_doc.insert()

			except Exception:
				frappe.db.rollback(save_point=savepoint)
				frappe.log_error(
					f"Bulk IN/OUT Checkin failed for employee {emp_id}.",
					reference_doctype="Employee Checkin",
				)
				failure.append(emp_id)
			else:
				success.append(
					{
						"doc": f"{get_link_to_form('Employee Checkin', in_doc.name)} / {get_link_to_form('Employee Checkin', out_doc.name)}",
						"employee": emp_id,
					}
				)

			count += 1
			frappe.publish_progress(count * 100 / len(employees), title=_("Creating IN & OUT Checkins..."))

		# Show desktop notification with summary
		notify_bulk_action_status("Employee Checkin", failure, [d["employee"] for d in success])

		# Realtime event for client to consume
		frappe.publish_realtime(
			"completed_bulk_employee_checkin",
			message={"success": success, "failure": failure},
			doctype="Bulk Employee Checkin",
			after_commit=True,
		)

	def _bulk_create_in_out_checkins_twice(
		self,
		employees: list,
		first_in_time: str,
		first_out_time: str,
		second_in_time: str,
		second_out_time: str,
		device_id: str | None = None,
		latitude: float | None = None,
		longitude: float | None = None,
		skip_auto_attendance: int | None = None,
		project: str | None = None,
	) -> None:
		"""Internal method to create both IN and OUT checkins twice for employees."""
		success, failure = [], []
		count = 0
		savepoint = "before_in_out_checkin_twice_insert"
		project_required = frappe.db.get_single_value("Payroll Settings", "project_mandatory_for_checkin")

		first_in_dt = get_datetime(first_in_time)
		first_out_dt = get_datetime(first_out_time)
		second_in_dt = get_datetime(second_in_time)
		second_out_dt = get_datetime(second_out_time)

		for employee in employees:
			emp_id = employee if isinstance(employee, str) else employee.get("employee")

			if project_required and not (project or getattr(self, "project", None)):
				failure.append(emp_id)
				continue

			try:
				frappe.db.savepoint(savepoint)

				# Create First IN checkin
				first_in_doc = frappe.new_doc("Employee Checkin")
				first_in_doc.employee = emp_id
				first_in_doc.time = first_in_dt
				first_in_doc.device_id = device_id or getattr(self, "device_id", None)
				first_in_doc.log_type = "IN"
				first_in_doc.project = project or getattr(self, "project", None)
				first_in_doc.latitude = latitude if latitude is not None else getattr(self, "latitude", None)
				first_in_doc.longitude = longitude if longitude is not None else getattr(self, "longitude", None)
				if frappe.utils.cint(skip_auto_attendance if skip_auto_attendance is not None else getattr(self, "skip_auto_attendance", 0)) == 1:
					first_in_doc.skip_auto_attendance = 1
				first_in_doc.insert()

				# Create First OUT checkin
				first_out_doc = frappe.new_doc("Employee Checkin")
				first_out_doc.employee = emp_id
				first_out_doc.time = first_out_dt
				first_out_doc.device_id = device_id or getattr(self, "device_id", None)
				first_out_doc.log_type = "OUT"
				first_out_doc.project = project or getattr(self, "project", None)
				first_out_doc.latitude = latitude if latitude is not None else getattr(self, "latitude", None)
				first_out_doc.longitude = longitude if longitude is not None else getattr(self, "longitude", None)
				if frappe.utils.cint(skip_auto_attendance if skip_auto_attendance is not None else getattr(self, "skip_auto_attendance", 0)) == 1:
					first_out_doc.skip_auto_attendance = 1
				first_out_doc.insert()

				# Create Second IN checkin
				second_in_doc = frappe.new_doc("Employee Checkin")
				second_in_doc.employee = emp_id
				second_in_doc.time = second_in_dt
				second_in_doc.device_id = device_id or getattr(self, "device_id", None)
				second_in_doc.log_type = "IN"
				second_in_doc.project = project or getattr(self, "project", None)
				second_in_doc.latitude = latitude if latitude is not None else getattr(self, "latitude", None)
				second_in_doc.longitude = longitude if longitude is not None else getattr(self, "longitude", None)
				if frappe.utils.cint(skip_auto_attendance if skip_auto_attendance is not None else getattr(self, "skip_auto_attendance", 0)) == 1:
					second_in_doc.skip_auto_attendance = 1
				second_in_doc.insert()

				# Create Second OUT checkin
				second_out_doc = frappe.new_doc("Employee Checkin")
				second_out_doc.employee = emp_id
				second_out_doc.time = second_out_dt
				second_out_doc.device_id = device_id or getattr(self, "device_id", None)
				second_out_doc.log_type = "OUT"
				second_out_doc.project = project or getattr(self, "project", None)
				second_out_doc.latitude = latitude if latitude is not None else getattr(self, "latitude", None)
				second_out_doc.longitude = longitude if longitude is not None else getattr(self, "longitude", None)
				if frappe.utils.cint(skip_auto_attendance if skip_auto_attendance is not None else getattr(self, "skip_auto_attendance", 0)) == 1:
					second_out_doc.skip_auto_attendance = 1
				second_out_doc.insert()

			except Exception:
				frappe.db.rollback(save_point=savepoint)
				frappe.log_error(
					f"Bulk IN/OUT Checkin (Twice) failed for employee {emp_id}.",
					reference_doctype="Employee Checkin",
				)
				failure.append(emp_id)
			else:
				success.append(
					{
						"doc": f"{get_link_to_form('Employee Checkin', first_in_doc.name)} / {get_link_to_form('Employee Checkin', first_out_doc.name)} / {get_link_to_form('Employee Checkin', second_in_doc.name)} / {get_link_to_form('Employee Checkin', second_out_doc.name)}",
						"employee": emp_id,
					}
				)

			count += 1
			frappe.publish_progress(count * 100 / len(employees), title=_("Creating IN & OUT Checkins (Twice)..."))

		# Show desktop notification with summary
		notify_bulk_action_status("Employee Checkin", failure, [d["employee"] for d in success])

		# Realtime event for client to consume
		frappe.publish_realtime(
			"completed_bulk_employee_checkin",
			message={"success": success, "failure": failure},
			doctype="Bulk Employee Checkin",
			after_commit=True,
		)