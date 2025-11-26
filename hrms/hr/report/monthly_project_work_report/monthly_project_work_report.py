import datetime
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import flt, get_datetime, getdate

from hrms.payroll.doctype.salary_structure_assignment.salary_structure_assignment import (
	get_assigned_salary_structure,
)


def execute(filters=None):
	if filters is None:
		filters = {}

	validate_filters(filters)
	data = get_data(filters)
	columns = get_columns()
	chart = get_chart(data)
	return columns, data, None, chart


def validate_filters(filters: dict) -> None:
	if not filters.get("from_date") or not filters.get("to_date"):
		frappe.throw(_("From Date and To Date are required"))
	if getdate(filters["from_date"]) > getdate(filters["to_date"]):
		frappe.throw(_("From Date cannot be after To Date"))


def get_columns():
		return [
		{"label": _("Employee"), "fieldname": "employee", "fieldtype": "Link", "options": "Employee", "width": 120},
		{"label": _("Employee Name"), "fieldname": "employee_name", "fieldtype": "Data", "width": 150},
		{"label": _("Project"), "fieldname": "project", "fieldtype": "Link", "options": "Project", "width": 150},
		{"label": _("Total Hours"), "fieldname": "total_hours", "fieldtype": "Float", "precision": 2, "width": 110},
		{"label": _("Overtime Hours"), "fieldname": "overtime_hours", "fieldtype": "Float", "precision": 2, "width": 120},
		{"label": _("Overtime Cost"), "fieldname": "overtime_cost", "fieldtype": "Currency", "width": 120},
		{"label": _("Actual Hours"), "fieldname": "actual_hours", "fieldtype": "Float", "precision": 2, "width": 110},
		{"label": _("Hourly Rate"), "fieldname": "hourly_rate", "fieldtype": "Currency", "width": 110},
		{"label": _("Cost"), "fieldname": "cost", "fieldtype": "Currency", "width": 120},
	]


def get_data(filters: dict):
	from_date = get_datetime(filters["from_date"])
	to_date = get_datetime(filters["to_date"]) + datetime.timedelta(days=1)

	checkin_filters = {
		"time": ["between", [from_date, to_date]],
	}
	if filters.get("employee"):
		checkin_filters["employee"] = filters["employee"]
	if filters.get("project"):
		checkin_filters["project"] = filters["project"]

	checkins = frappe.db.get_all(
		"Employee Checkin",
		fields=["employee", "employee_name", "project", "time", "log_type"],
		filters=checkin_filters,
		order_by="employee asc, project asc, time asc",
	)
	if not checkins:
		checkins = []

	ot_map = get_overtime_by_employee_project(filters)

	# group by employee and project
	grouped: dict[tuple[str, str], list] = defaultdict(list)
	for row in checkins:
		key = (row.employee, row.project or _("Unassigned"))
		grouped[key].append(row)

	result = []
	# include keys that have OT but no checkins
	for (employee, project), ot_vals in ot_map.items():
		grouped.setdefault((employee, project), [])

	for (employee, project), rows in grouped.items():
		rows_sorted = sorted(rows, key=lambda r: r.time) if rows else []
		total_seconds = compute_total_seconds(rows_sorted) if rows_sorted else 0
		ot_meta = ot_map.get((employee, project), {"hours": 0, "amount": 0})
		overtime_seconds = ot_meta.get("hours", 0) * 3600
		overtime_cost = ot_meta.get("amount", 0)

		actual_seconds = max(total_seconds - overtime_seconds, 0)
		emp_name = rows_sorted[0].employee_name if rows_sorted else ""
		hourly_rate = get_employee_hourly_rate(employee, filters.get("from_date"))
		standard_cost = (actual_seconds / 3600) * hourly_rate if hourly_rate else 0
		cost = standard_cost + overtime_cost

		result.append(
			{
				"employee": employee,
				"employee_name": emp_name,
				"project": project if project != _("Unassigned") else None,
				"total_hours": flt(total_seconds / 3600, 2),
				"overtime_hours": flt(overtime_seconds / 3600, 2),
				"overtime_cost": flt(overtime_cost, 2),
				"actual_hours": flt(actual_seconds / 3600, 2),
				"hourly_rate": hourly_rate,
				"cost": cost,
			}
		)

	return result


def compute_total_seconds(rows):
	"""Calculate total seconds from IN/OUT pairs in the sorted logs."""
	total = 0
	in_time = None
	for row in rows:
		if row.log_type == "IN":
			in_time = row.time
		elif row.log_type == "OUT" and in_time:
			diff = (row.time - in_time).total_seconds()
			if diff > 0:
				total += diff
			in_time = None
	return total


def compute_overtime_seconds(rows, filters):
	"""Simple overtime: anything beyond 8 hours per day counted as OT."""
	by_date = defaultdict(list)
	for row in rows:
		by_date[getdate(row.time)].append(row)

	ot_seconds = 0
	WORKDAY_SECONDS = 8 * 3600
	for day_rows in by_date.values():
		total = compute_total_seconds(sorted(day_rows, key=lambda r: r.time))
		if total > WORKDAY_SECONDS:
			ot_seconds += total - WORKDAY_SECONDS
	return ot_seconds


def get_employee_hourly_rate(employee, on_date=None):
	"""Derive hourly rate from assigned Salary Structure; fall back to Employee.hourly_rate if present."""
	salary_structure = get_assigned_salary_structure(employee, getdate(on_date) if on_date else None)
	if salary_structure:
		rate = flt(frappe.db.get_value("Salary Structure", salary_structure, "hour_rate")) or 0
		if rate:
			return rate

	# fallback if column exists on Employee
	if frappe.db.has_column("Employee", "hourly_rate"):
		return flt(frappe.db.get_value("Employee", employee, "hourly_rate")) or 0
	return 0


def get_chart(data):
	if not data:
		return None
	labels = [f"{row['employee']} - {row.get('project') or _('Unassigned')}" for row in data][:10]
	dataset = [row["total_hours"] for row in data][:10]
	return {
		"data": {
			"labels": labels,
			"datasets": [{"name": _("Total Hours"), "values": dataset}],
		},
		"type": "bar",
		"colors": ["#5e64ff"],
	}


def get_overtime_by_employee_project(filters):
	from_date = getdate(filters["from_date"])
	to_date = getdate(filters["to_date"])
	conditions = {
		"date": ["between", [from_date, to_date]],
	}
	if filters.get("employee"):
		conditions["parent.employee"] = filters["employee"]
	if filters.get("project"):
		conditions["project"] = filters["project"]

	ot_rows = frappe.get_all(
		"Overtime Details",
		filters=conditions,
		fields=["parent", "date", "project", "overtime_duration", "overtime_amount"],
	)
	attendance_rows = frappe.get_all(
		"Attendance",
		filters={
			"attendance_date": ["between", [from_date, to_date]],
			"docstatus": 1,
			"actual_overtime_duration": [">", 0],
		},
		fields=["attendance_date", "employee", "project", "actual_overtime_duration", "rate", "multiplier"],
	)
	if not ot_rows and not attendance_rows:
		return {}

	# fetch employee for parents in bulk
	parent_map = {}
	if ot_rows:
		parents = list({r.parent for r in ot_rows})
		parent_map = dict(
			frappe.get_all("Overtime Slip", filters={"name": ["in", parents]}, fields=["name", "employee"])
		)

	agg = {}
	for r in ot_rows:
		employee = parent_map.get(r.parent, {}).get("employee") if parent_map.get(r.parent) else None
		if not employee:
			continue
		project = r.project or _("Unassigned")
		key = (employee, project)
		agg.setdefault(key, {"hours": 0, "amount": 0})
		agg[key]["hours"] += flt(r.overtime_duration or 0)
		agg[key]["amount"] += flt(r.overtime_amount or 0)

	for r in attendance_rows:
		employee = r.employee
		if filters.get("employee") and employee != filters.get("employee"):
			continue
		project = r.project or _("Unassigned")
		key = (employee, project)
		agg.setdefault(key, {"hours": 0, "amount": 0})
		agg[key]["hours"] += flt(r.actual_overtime_duration or 0)
		if r.rate:
			agg[key]["amount"] += flt(r.actual_overtime_duration or 0) * flt(r.rate) * flt(r.multiplier or 1)
	return agg
