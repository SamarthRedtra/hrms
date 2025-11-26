# Copyright (c) 2024, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import json
from datetime import timedelta
from email.utils import formatdate

import frappe
from frappe import _, bold
from frappe.model.docstatus import DocStatus
from frappe.model.document import Document
from frappe.utils import cstr, flt, cint
from frappe.utils.data import format_time, get_link_to_form, getdate

from hrms.payroll.doctype.payroll_entry.payroll_entry import get_start_end_dates
from hrms.payroll.doctype.salary_structure_assignment.salary_structure_assignment import (
	get_assigned_salary_structure,
)


class OvertimeSlip(Document):
	def validate(self):
		if not (self.start_date or self.end_date):
			self.get_frequency_and_dates()

		if self.start_date > self.end_date:
			frappe.throw(_("Start date cannot be greater than end date"))

		self.validate_overlap()
		self.validate_overtime_date_and_duration()

	def on_submit(self):
		self.process_overtime_slip()

	def validate_overlap(self):
		overtime_slips = frappe.db.get_all(
			"Overtime Slip",
			filters={
				"docstatus": ("!=", 2),
				"employee": self.employee,
				"end_date": (">=", self.start_date),
				"start_date": ("<=", self.end_date),
				"name": ("!=", self.name),
			},
		)
		if len(overtime_slips):
			form_link = get_link_to_form("Overtime Slip", overtime_slips[0].name)
			msg = _("Overtime Slip:{0} has been created between {1} and {2}").format(
				bold(form_link), bold(self.start_date), bold(self.end_date)
			)
			frappe.throw(msg)

	def validate_overtime_date_and_duration(self):
		dates = set()
		overtime_type_cache = {}
		for detail in self.overtime_details:
			# check for duplicate dates
			if detail.date in dates:
				frappe.throw(_("Date {0} is repeated in Overtime Details").format(detail.date))
			dates.add(detail.date)
			# validate duration only for overtime details not linked to attendance
			if detail.reference_document:
				continue

			if detail.overtime_type not in overtime_type_cache:
				overtime_type_cache[detail.overtime_type] = frappe.db.get_value(
					"Overtime Type", detail.overtime_type, "maximum_overtime_hours_allowed"
				)
			maximum_overtime_hours = overtime_type_cache[detail.overtime_type]
			if maximum_overtime_hours:
				if detail.overtime_duration > maximum_overtime_hours:
					frappe.throw(
						_("Overtime Duration for {0} is greater than Maximum Overtime Hours Allowed").format(
							detail.date
						)
					)

	@frappe.whitelist()
	def get_frequency_and_dates(self):
		date = self.posting_date

		salary_structure = get_assigned_salary_structure(self.employee, date)
		if salary_structure:
			payroll_frequency = frappe.db.get_value("Salary Structure", salary_structure, "payroll_frequency")
			date_details = get_start_end_dates(
				payroll_frequency, date, frappe.db.get_value("Employee", self.employee, "company")
			)
			self.start_date = date_details.start_date
			self.end_date = date_details.end_date
		else:
			frappe.throw(
				_("Salary Structure not assigned for employee {0} for date {1}").format(
					self.employee, self.start_date
				)
			)

	@frappe.whitelist()
	def get_emp_and_overtime_details(self):
		records = self.get_attendance_records()
		if len(records):
			self.create_overtime_details_row_for_attendance(records)
		if len(self.overtime_details):
			total_overtime_duration = 0.0
			for detail in self.overtime_details:
				if detail.overtime_duration is not None:
					total_overtime_duration += detail.overtime_duration
			self.total_overtime_duration = total_overtime_duration
		self.save()

	def create_overtime_details_row_for_attendance(self, records):
		self.overtime_details = []
		overtime_type_cache = {}

		for record in records:
			if record.overtime_type not in overtime_type_cache:
				overtime_type_cache[record.overtime_type] = frappe.db.get_value(
					"Overtime Type", record.overtime_type, "maximum_overtime_hours_allowed"
				)

			maximum_overtime_hours_allowed = overtime_type_cache[record.overtime_type]
			overtime_duration = record.actual_overtime_duration or 0.0

			if maximum_overtime_hours_allowed > 0:
				overtime_duration = (
					overtime_duration
					if maximum_overtime_hours_allowed > overtime_duration
					else maximum_overtime_hours_allowed
				)

			if overtime_duration > 0:
					self.append(
						"overtime_details",
						{
							"reference_document": record.name,
							"date": record.attendance_date,
							"overtime_type": record.overtime_type,
							"overtime_duration": overtime_duration,
							"standard_working_hours": record.standard_working_hours,
							"project": record.get("project"),
						},
					)

	def get_attendance_records(self):
		records = []
		if self.start_date and self.end_date:
			records = frappe.get_all(
				"Attendance",
				fields=[
					"name",
					"attendance_date",
					"overtime_type",
					"actual_overtime_duration",
					"standard_working_hours",
					"project",
				],
				filters={
					"employee": self.employee,
					"docstatus": 1,
					"attendance_date": ("between", [getdate(self.start_date), getdate(self.end_date)]),
					"status": "Present",
					"overtime_type": ["!=", ""],
				},
			)
			if not len(records):
				frappe.throw(
					_("No attendance records found for employee {0} between {1} and {2}").format(
						self.employee, self.start_date, self.end_date
					)
				)
		return records

	def process_overtime_slip(self):
		overtime_components, ot_calc_lines = self.get_overtime_component_amounts()

		precision = frappe.db.get_single_value("System Settings", "currency_precision") or 2
		for component, total_amount in overtime_components.items():
			self.create_additional_salary(component, total_amount, precision)

		# Create Additional Salary for Food Allowance based on OT thresholds, only if enabled in Payroll Settings
		food_calc_lines = []
		try:
			if cint(frappe.db.get_single_value("Payroll Settings", "allocate_food_allowance")):
				food_allowance_total, food_calc_lines = self.calculate_food_allowance_total()
				if food_allowance_total > 0:
					self.create_additional_salary("Food Allowance", food_allowance_total, precision)
		except Exception as e:
			frappe.log_error(message=str(frappe.get_traceback()),title="Error creating food allowance")

		# Add calculation history comment for debugging
		try:
			comment_parts = []
			comment_parts.append(_("Overtime Calculation Details"))
			comment_parts.append(_(f"Normal OT Hours: {flt(getattr(self, 'normal_ot_hours', 0.0))}, Holiday OT Hours: {flt(getattr(self, 'holiday_ot_hours', 0.0))}"))
			if ot_calc_lines:
				comment_parts.append(_("Breakdown:"))
				for line in ot_calc_lines:
					comment_parts.append(line)
			if food_calc_lines:
				comment_parts.append(_("Food Allowance Calculation:"))
				for line in food_calc_lines:
					comment_parts.append(line)
			self.add_comment(comment_type="Info", text="<br>".join(comment_parts))
		except Exception:
			# do not fail submission due to comment issues
			pass

	def create_additional_salary(self, salary_component, total_amount, precision=None):
		if total_amount > 0:
			additional_salary = frappe.get_doc(
				{
					"doctype": "Additional Salary",
					"company": self.company,
					"employee": self.employee,
					"salary_component": salary_component,
					"amount": flt(total_amount, precision),
					"payroll_date": self.end_date,
					"overwrite_salary_structure_amount": 0,
					"ref_doctype": "Overtime Slip",
					"ref_docname": self.name,
				}
			)
			additional_salary.submit()

	def get_overtime_component_amounts(self):
		"""
		Get amount for each overtime detail child item, sum and group amounts by salary component for additional salary creation
		"""
		if not self.overtime_details:
			return {}

		unique_overtime_types = {detail.overtime_type for detail in self.overtime_details}

		self.overtime_types = self._bulk_load_overtime_types(unique_overtime_types)
		holiday_date_map = self.get_holiday_map()
		overtime_components = {}
		child_updates = []
		attendance_updates = []
		normal_hours_sum = 0.0
		holiday_hours_sum = 0.0
		calc_lines = []

		for overtime_detail in self.overtime_details:
			overtime_type = overtime_detail.overtime_type
			# calculate hourly rate separately for each overtime log since standard working hours may vary
			applicable_hourly_rate = self._get_applicable_hourly_rate(
				overtime_type, overtime_detail.get("standard_working_hours")
			)

			overtime_amount, meta = self.calculate_overtime_amount(
				overtime_type,
				applicable_hourly_rate,
				overtime_detail.overtime_duration,
				overtime_detail.date,
				holiday_date_map,
			)

			salary_component = self.overtime_types[overtime_type]["overtime_salary_component"]
			overtime_components[salary_component] = (
				overtime_components.get(salary_component, 0) + overtime_amount
			)

			# persist calculated amount on child row for downstream usage (salary slips)
			overtime_detail.overtime_amount = flt(overtime_amount)
			overtime_detail.rate = flt(applicable_hourly_rate)
			overtime_detail.multiplier = flt(meta.get("multiplier"))
			if overtime_detail.name:
				child_updates.append((overtime_detail.name, overtime_amount, applicable_hourly_rate, meta.get("multiplier")))
			if overtime_detail.reference_document:
				attendance_updates.append(
					(overtime_detail.reference_document, applicable_hourly_rate, meta.get("multiplier"))
				)

			# accumulate normal vs holiday hours and build calc lines
			ot_hours = overtime_detail.overtime_duration or 0.0
			if meta.get("day_type") == "Normal":
				normal_hours_sum += ot_hours
			else:
				holiday_hours_sum += ot_hours
			calc_lines.append(
				_(f"{cstr(overtime_detail.date)}: {ot_hours}h, type={meta.get('day_type')}, rate={flt(applicable_hourly_rate)}, multiplier={meta.get('multiplier')} -> amount={flt(overtime_amount)}")
			)

		# persist hours on the document
		try:
			self.db_set("normal_ot_hours", flt(normal_hours_sum), update_modified=False)
			self.db_set("holiday_ot_hours", flt(holiday_hours_sum), update_modified=False)
		except Exception:
			# field may not exist; ignore silently
			pass

		# also set attributes for comment composition
		self.normal_ot_hours = normal_hours_sum
		self.holiday_ot_hours = holiday_hours_sum

		# update stored child values to reflect calculated amounts
		for child_name, amount, rate, multiplier in child_updates:
			try:
				frappe.db.set_value(
					"Overtime Details",
					child_name,
					{
						"overtime_amount": flt(amount),
						"rate": flt(rate),
						"multiplier": flt(multiplier),
					},
				)
			except Exception:
				pass

		# push rate and multiplier back to Attendance rows when linked
		for att_name, rate, multiplier in attendance_updates:
			try:
				frappe.db.set_value(
					"Attendance",
					att_name,
					{
						"rate": flt(rate),
						"multiplier": flt(multiplier),
					},
				)
			except Exception:
				pass

		return overtime_components, calc_lines

	def calculate_food_allowance_total(self):
		"""
		Calculate Food Allowance based on OT duration and day type rules:
		- Normal day: AED 15 if OT >= 3 hours
		- Weekend/Public Holiday: AED 15 if OT >= 9 hours, AED 30 if OT >= 12 hours
		Returns total allowance for the slip period.
		"""
		if not self.overtime_details:
			return 0.0, []

		holiday_date_map = self.get_holiday_map()
		total_allowance = 0.0
		calc_lines = []

		for overtime_detail in self.overtime_details:
			ot_hours = overtime_detail.overtime_duration or 0.0
			date_key = cstr(overtime_detail.date)
			holiday_info = holiday_date_map.get(date_key)
			is_weekend = bool(holiday_info and getattr(holiday_info, "weekly_off", False))
			is_public_holiday = bool(holiday_info and not getattr(holiday_info, "weekly_off", False))

			if is_weekend or is_public_holiday:
				if ot_hours >= 12:
					total_allowance += 30
					calc_lines.append(_(f"{date_key}: {ot_hours}h (Weekend/Holiday) -> +30"))
				elif ot_hours >= 9:
					total_allowance += 15
					calc_lines.append(_(f"{date_key}: {ot_hours}h (Weekend/Holiday) -> +15"))
			else:
				if ot_hours >= 3:
					total_allowance += 15
					calc_lines.append(_(f"{date_key}: {ot_hours}h (Normal) -> +15"))

		return total_allowance, calc_lines

	def _bulk_load_overtime_types(self, overtime_type_names):
		"""
		Load all overtime type details in bulk
		"""
		if not overtime_type_names:
			return {}

		# Get all overtime types details
		overtime_types_data = frappe.get_all(
			"Overtime Type",
			filters={"name": ["in", list(overtime_type_names)]},
			fields=[
				"name",
				"standard_multiplier",
				"weekend_multiplier",
				"public_holiday_multiplier",
				"applicable_for_weekend",
				"applicable_for_public_holiday",
				"overtime_salary_component",
				"overtime_calculation_method",
				"hourly_rate",
			],
		)

		overtime_types = {}
		salary_component_based_types = []

		for ot_data in overtime_types_data:
			overtime_types[ot_data.name] = ot_data
			if ot_data.overtime_calculation_method == "Salary Component Based":
				salary_component_based_types.append(ot_data.name)

		# Bulk load salary components for salary component based types
		if salary_component_based_types:
			salary_components_data = frappe.get_all(
				"Overtime Salary Component",
				filters={"parent": ["in", salary_component_based_types]},
				fields=["parent", "salary_component"],
			)

			# Group by parent
			components_by_parent = {}
			for comp_data in salary_components_data:
				if comp_data.parent not in components_by_parent:
					components_by_parent[comp_data.parent] = []
				components_by_parent[comp_data.parent].append(comp_data.salary_component)

			for ot_type in salary_component_based_types:  # Add components to overtime types
				overtime_types[ot_type]["components"] = components_by_parent.get(ot_type, [])

		return overtime_types

	def _get_applicable_hourly_rate(self, overtime_type, standard_working_hours=0):
		overtime_details = self.overtime_types[overtime_type]
		overtime_calculation_method = overtime_details["overtime_calculation_method"]

		applicable_hourly_rate = 0.0
		if overtime_calculation_method == "Fixed Hourly Rate":
			applicable_hourly_rate = overtime_details.get("hourly_rate", 0.0)
		elif overtime_calculation_method == "Salary Component Based":
			applicable_hourly_rate = self._calculate_component_based_hourly_rate(
				overtime_type, standard_working_hours
			)
		return applicable_hourly_rate

	def _calculate_component_based_hourly_rate(self, overtime_type, standard_working_hours):
		components = self.overtime_types[overtime_type]["components"] or []

		if not hasattr(self, "_cached_salary_slip"):
			salary_structure = get_assigned_salary_structure(self.employee, self.start_date)
			self._cached_salary_slip = self._make_salary_slip(salary_structure)

		if not components or not hasattr(self, "_cached_salary_slip"):
			return 0.0

		component_amount = sum(
			data.amount
			for data in self._cached_salary_slip.earnings
			if data.salary_component in components and not data.get("additional_salary", None)
		)
		# Use fixed baseline of 30 days and 8 working hours per day for overtime additional salary
		# This ensures hourly rate = monthly component amount / (30 days * 8 hours)
		fixed_payment_days = 30
		fixed_working_hours_per_day = 8 or standard_working_hours
		applicable_daily_amount = component_amount / fixed_payment_days if fixed_payment_days else 0

		return applicable_daily_amount / fixed_working_hours_per_day if fixed_working_hours_per_day else 0.0

	def _make_salary_slip(self, salary_structure):
		from hrms.payroll.doctype.salary_structure.salary_structure import make_salary_slip

		return make_salary_slip(
			salary_structure,
			employee=self.employee,
			ignore_permissions=True,
			posting_date=self.start_date,
		)

	def calculate_overtime_amount(
		self, overtime_type, applicable_hourly_rate, overtime_duration, overtime_date, holiday_date_map
	):
		"""
		Calculate total amount for the given overtime detail child item based on its type and date.
		"""
		overtime_details = self.overtime_types.get(overtime_type)
		if not overtime_details:
			return 0.0, {"multiplier": 1, "day_type": "Normal"}

		if applicable_hourly_rate <= 0:
			return 0.0, {"multiplier": 1, "day_type": "Normal"}

		print("overtime_details", applicable_hourly_rate, overtime_duration, overtime_date)
		overtime_date_str = cstr(overtime_date)
		multiplier = overtime_details.get("standard_multiplier", 1)
		day_type = "Normal"

		holiday_info = holiday_date_map.get(overtime_date_str)
		if holiday_info:
			if overtime_details.get("applicable_for_weekend") and holiday_info.weekly_off:
				print("weekend_multiplier", overtime_details.get("weekend_multiplier", multiplier))
				multiplier = overtime_details.get("weekend_multiplier", multiplier)
				day_type = "Weekend"
			elif overtime_details.get("applicable_for_public_holiday") and not holiday_info.weekly_off:
				print("public_holiday_multiplier", overtime_details.get("public_holiday_multiplier", multiplier))
				multiplier = overtime_details.get("public_holiday_multiplier", multiplier)
				day_type = "Public Holiday"

		amount = overtime_duration * applicable_hourly_rate * multiplier
		return amount, {"multiplier": multiplier, "day_type": day_type}

	def get_holiday_map(self):
		from erpnext.setup.doctype.employee.employee import get_holiday_list_for_employee

		from hrms.utils.holiday_list import get_holiday_dates_between

		holiday_list = get_holiday_list_for_employee(self.employee)
		holiday_dates = get_holiday_dates_between(
			holiday_list, self.start_date, self.end_date, select_weekly_off=True, as_dict=True
		)

		holiday_date_map = {}
		for holiday_date in holiday_dates:
			holiday_date_map[cstr(holiday_date.holiday_date)] = holiday_date

		return holiday_date_map

	def get_overtime_type_details(self, name):
		details = frappe.get_value(
			"Overtime Type",
			filters={"name": name},
			fieldname=[
				"name",
				"standard_multiplier",
				"weekend_multiplier",
				"public_holiday_multiplier",
				"applicable_for_weekend",
				"applicable_for_public_holiday",
				"overtime_salary_component",
				"overtime_calculation_method",
				"hourly_rate",
			],
			as_dict=True,
		)

		components = []
		if details.overtime_calculation_method == "Salary Component Based":
			components = frappe.get_all(
				"Overtime Salary Component", filters={"parent": name}, fields=["salary_component"]
			)
			components = [data.salary_component for data in components]
		details["components"] = components

		return details


@frappe.whitelist()
def filter_employees_for_overtime_slip_creation(start_date, end_date, employees, limit=None):
	if not employees:
		return []

	if not isinstance(employees, list):
		employees = json.loads(employees)

	OvertimeSlip = frappe.qb.DocType("Overtime Slip")
	Attendance = frappe.qb.DocType("Attendance")

	# First, get employees with valid attendance records
	employees_with_overtime_attendance = (
		frappe.qb.from_(Attendance)
		.select(Attendance.employee)
		.distinct()
		.where(
			(Attendance.employee.isin(employees))
			& (Attendance.attendance_date >= start_date)
			& (Attendance.attendance_date <= end_date)
			& (Attendance.docstatus == 1)  # Only submitted attendance
			& (Attendance.status == "Present")  # Only present attendance
			& (Attendance.overtime_type != "")
			& (Attendance.overtime_type.isnotnull())
		)
	).run(pluck=True)

	if not employees_with_overtime_attendance:
		return []

	# exclude employees who already have overtime slips for this period
	employees_with_existing_overtime_slips = (
		frappe.qb.from_(OvertimeSlip)
		.select(OvertimeSlip.employee)
		.distinct()
		.where(
			(OvertimeSlip.employee.isin(employees_with_overtime_attendance))
			& (OvertimeSlip.docstatus != 2)
			& (OvertimeSlip.start_date <= end_date)
			& (OvertimeSlip.end_date >= start_date)
		)
	).run(pluck=True)

	# Get eligible employees (those with overtime attendance but no existing slips)
	eligible_employees = list(
		set(employees_with_overtime_attendance) - set(employees_with_existing_overtime_slips)
	)

	return eligible_employees


def create_overtime_slips_for_employees(employees, args):
	count = 0
	errors = []
	for emp in employees:
		args.update({"doctype": "Overtime Slip", "employee": emp})
		try:
			frappe.get_doc(args).get_emp_and_overtime_details()
			count += 1
		except Exception as e:
			frappe.clear_last_message()
			errors.append(_("Employee {0} : {1}").format(emp, str(e)))
			frappe.log_error(frappe.get_traceback(), _("Overtime Slip Creation Error for {0}").format(emp))

	if count:
		frappe.msgprint(
			_("Overtime Slip created for {0} employee(s)").format(count),
			indicator="green",
			title=_("Overtime Slips Created"),
		)
	if errors:
		error_list_html = "".join(f"<li>{err}</li>" for err in errors)
		frappe.msgprint(
			title=_("Overtime Slip Creation Failed"),
			msg=f"<ul>{error_list_html}</ul>",
			indicator="red",
		)

	status = "Failed" if errors else "Draft"
	frappe.get_doc("Payroll Entry", args.get("payroll_entry")).db_set({"status": status})
	frappe.publish_realtime("completed_overtime_slip_creation", user=frappe.session.user)


def submit_overtime_slips_for_employees(overtime_slips, payroll_entry):
	count = 0
	errors = []
	for overtime_slip in overtime_slips:
		try:
			doc = frappe.get_doc("Overtime Slip", overtime_slip)
			doc.submitted_via_payroll_entry = 1
			doc.submit()
			count += 1
		except Exception as e:
			frappe.clear_last_message()
			errors.append(_("{0} : {1}").format(overtime_slip, str(e)))
			frappe.log_error(
				frappe.get_traceback(), _("Overtime Slip Submission Error for {0}").format(overtime_slip)
			)
	if count:
		frappe.msgprint(
			_("Overtime Slips submitted for {0} employee(s)").format(count),
			indicator="green",
			title=_("Overtime Slip Submitted"),
		)
	if errors:
		error_list_html = "".join(f"<li>{err}</li>" for err in errors)
		frappe.msgprint(
			title=_("Overtime Slip Submission Failed"),
			msg=_(f"<ul>{error_list_html}</ul>"),
			indicator="red",
		)

	status = "Failed" if errors else "Draft"
	payroll_entry = frappe.get_doc("Payroll Entry", payroll_entry).db_set({"status": status})
	frappe.publish_realtime("completed_overtime_slip_submission", user=frappe.session.user)
