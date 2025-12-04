import datetime
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import flt, get_datetime, getdate

UNASSIGNED_LABEL = _("Unassigned")
DEFAULT_OT_META = {"hours": 0, "amount": 0}


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
		{"label": _("Cost"), "fieldname": "cost", "fieldtype": "Currency", "width": 120},
	]


def get_data(filters: dict):
	from_date = get_datetime(filters["from_date"])
	# Extend to_date by 1 extra day to capture OUT punches for night shifts
	to_date = get_datetime(filters["to_date"]) + datetime.timedelta(days=2)

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
		order_by="employee asc, time asc",
	)
	if not checkins:
		checkins = []

	ot_map = get_overtime_by_employee_project(filters)
	project_cost_map = get_project_cost_map(filters)

	# Group by employee first, then pair IN/OUT and aggregate by project
	employee_logs = defaultdict(list)
	for row in checkins:
		employee_logs[row.employee].append(row)

	# Process each employee's logs to pair IN/OUT across days
	grouped: dict[tuple[str, str], dict] = defaultdict(lambda: {"seconds": 0, "employee_name": ""})
	
	filter_start = getdate(filters["from_date"])
	filter_end = getdate(filters["to_date"])
	
	for employee, logs in employee_logs.items():
		# Sort by time
		sorted_logs = sorted(logs, key=lambda x: x.time)
		
		# Pair IN with next OUT (handles cross-day scenarios)
		open_in = None
		for log in sorted_logs:
			if log.log_type == "IN":
				open_in = log
			elif log.log_type == "OUT" and open_in:
				# Calculate duration
				diff = (log.time - open_in.time).total_seconds()
				if diff > 0:
					# Use IN's date to determine if this pair falls within filter range
					in_date = getdate(open_in.time)
					if filter_start <= in_date <= filter_end:
						# Use IN's project (or OUT's if IN has none)
						project = open_in.project or log.project or UNASSIGNED_LABEL
						key = (employee, project)
						grouped[key]["seconds"] += diff
						grouped[key]["employee_name"] = open_in.employee_name or log.employee_name
				open_in = None

	all_keys = set(grouped.keys())
	all_keys.update(ot_map.keys())
	all_keys.update(project_cost_map.keys())

	result = []
	for employee, project in all_keys:
		entry = grouped.get((employee, project), {"seconds": 0, "employee_name": ""})
		total_seconds = entry["seconds"]
		ot_meta = ot_map.get((employee, project), DEFAULT_OT_META)
		overtime_seconds = (ot_meta.get("hours") or 0) * 3600
		overtime_cost = ot_meta.get("amount") or 0

		actual_seconds = max(total_seconds - overtime_seconds, 0)
		cost_entry = project_cost_map.get((employee, project), {})
		cost = flt(cost_entry.get("cost") or 0, 2)
		emp_name = entry["employee_name"] or cost_entry.get("employee_name", "")

		result.append(
			{
				"employee": employee,
				"employee_name": emp_name,
				"project": project if project != UNASSIGNED_LABEL else None,
				"total_hours": flt(total_seconds / 3600, 2),
				"overtime_hours": flt(overtime_seconds / 3600, 2),
				"overtime_cost": flt(overtime_cost, 2),
				"actual_hours": flt(actual_seconds / 3600, 2),
				"cost": cost,
			}
		)

	return result


def compute_total_seconds(rows):
	"""Calculate total seconds from IN/OUT pairs in the sorted logs (handles cross-day)."""
	total = 0
	in_time = None
	sorted_rows = sorted(rows, key=lambda x: x.time)
	for row in sorted_rows:
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


def get_chart(data):
	if not data:
		return None
	labels = [f"{row['employee']} - {row.get('project') or UNASSIGNED_LABEL}" for row in data][:10]
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
		project = r.project or UNASSIGNED_LABEL
		key = (employee, project)
		agg.setdefault(key, {"hours": 0, "amount": 0})
		agg[key]["hours"] += flt(r.overtime_duration or 0)
		agg[key]["amount"] += flt(r.overtime_amount or 0)

	for r in attendance_rows:
		employee = r.employee
		if filters.get("employee") and employee != filters.get("employee"):
			continue
		project = r.project or UNASSIGNED_LABEL
		key = (employee, project)
		agg.setdefault(key, {"hours": 0, "amount": 0})
		agg[key]["hours"] += flt(r.actual_overtime_duration or 0)
		if r.rate:
			agg[key]["amount"] += flt(r.actual_overtime_duration or 0) * flt(r.rate) * flt(r.multiplier or 1)
	return agg


def get_project_cost_map(filters: dict) -> dict[tuple[str, str], dict]:
	from_date = getdate(filters["from_date"])
	to_date = getdate(filters["to_date"])

	slip_filters = {
		"docstatus": 1,
		"start_date": [">=", from_date],
		"end_date": ["<=", to_date],
	}
	if filters.get("employee"):
		slip_filters["employee"] = filters["employee"]
	salary_slips = frappe.get_all(
		"Salary Slip",
		filters=slip_filters,
		fields=["employee", "employee_name", "project_costing_json"],
	)

	cost_map: dict[tuple[str, str], dict] = {}
	if not salary_slips:
		return cost_map

	for slip in salary_slips:
		if not slip.project_costing_json:
			continue

		project_rows = frappe.parse_json(slip.project_costing_json) or []
		for row in project_rows:
			project_name = row.get("project_name") or UNASSIGNED_LABEL
			if filters.get("project") and filters["project"] != row.get("project_name"):
				continue

			key = (slip.employee, project_name)
			entry = cost_map.setdefault(
				key,
				{
					"cost": 0,
					"employee_name": row.get("employee_name") or slip.employee_name or "",
				},
			)
			entry["cost"] += flt(row.get("cost") or 0)

	return cost_map
