from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import flt, getdate

from hrms.hr.report.monthly_project_work_report.monthly_project_work_report import (
	get_data as get_monthly_project_work_data,
)


def execute(filters=None):
	filters = filters or {}
	validate_filters(filters)
	return get_columns(), get_data(filters)


def validate_filters(filters: dict) -> None:
	if not filters.get("from_date") or not filters.get("to_date") or not filters.get("company"):
		frappe.throw(_("From Date, To Date and Company are required"))
	if getdate(filters["from_date"]) > getdate(filters["to_date"]):
		frappe.throw(_("From Date cannot be after To Date"))


def get_columns() -> list[dict]:
	return [
		{"label": _("Project"), "fieldname": "project", "fieldtype": "Link", "options": "Project", "width": 150},
		{"label": _("Project Name"), "fieldname": "project_name", "fieldtype": "Data", "width": 220},
		{"label": _("Employees"), "fieldname": "employee_count", "fieldtype": "Int", "width": 100},
		{"label": _("Total Hours"), "fieldname": "total_hours", "fieldtype": "Float", "precision": 2, "width": 110},
		{"label": _("Actual Hours"), "fieldname": "actual_hours", "fieldtype": "Float", "precision": 2, "width": 110},
		{"label": _("Overtime Hours"), "fieldname": "overtime_hours", "fieldtype": "Float", "precision": 2, "width": 120},
		{"label": _("Allocated Salary Cost"), "fieldname": "allocated_salary_cost", "fieldtype": "Currency", "width": 150},
		{"label": _("Overtime Cost"), "fieldname": "overtime_cost", "fieldtype": "Currency", "width": 120},
	]


def get_data(filters: dict) -> list[dict]:
	monthly_rows = get_monthly_project_work_data(filters)
	grouped = defaultdict(_new_project_row)

	for row in monthly_rows:
		project = row.get("project")
		if not project:
			continue
		project_row = grouped[project]
		project_row["project"] = project
		project_row["employees"].add(row.get("employee"))
		project_row["total_hours"] += flt(row.get("total_hours"))
		project_row["actual_hours"] += flt(row.get("actual_hours"))
		project_row["overtime_hours"] += flt(row.get("overtime_hours"))
		project_row["allocated_salary_cost"] += flt(row.get("cost"))
		project_row["overtime_cost"] += flt(row.get("overtime_cost"))

	project_names = _get_project_names(grouped)
	data = []
	for project, row in grouped.items():
		data.append({
			"project": project,
			"project_name": project_names.get(project, project),
			"employee_count": len(row["employees"] - {None, ""}),
			"total_hours": flt(row["total_hours"], 2),
			"actual_hours": flt(row["actual_hours"], 2),
			"overtime_hours": flt(row["overtime_hours"], 2),
			"allocated_salary_cost": flt(row["allocated_salary_cost"], 2),
			"overtime_cost": flt(row["overtime_cost"], 2),
		})
	return sorted(data, key=lambda row: (row["project_name"], row["project"]))


def _new_project_row() -> dict:
	return {
		"employees": set(),
		"total_hours": 0,
		"actual_hours": 0,
		"overtime_hours": 0,
		"allocated_salary_cost": 0,
		"overtime_cost": 0,
	}


def _get_project_names(rows: dict) -> dict[str, str]:
	projects = list(rows)
	if not projects:
		return {}
	return {
		row.name: row.project_name or row.name
		for row in frappe.get_all(
			"Project",
			filters={"name": ["in", projects]},
			fields=["name", "project_name"],
		)
	}
