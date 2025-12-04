# Copyright (c) 2022, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt


import frappe
from frappe import _
from frappe.desk.doctype.dashboard_chart.dashboard_chart import get_result
from frappe.utils import getdate
from frappe.utils.dashboard import cache_source
from frappe.utils.dateutils import get_period


@frappe.whitelist()
@cache_source
def get_data(
	chart_name=None,
	chart=None,
	no_cache=None,
	filters=None,
	from_date=None,
	to_date=None,
	timespan=None,
	time_interval=None,
	heatmap_year=None,
) -> dict[str, list]:
	if filters:
		filters = frappe.parse_json(filters)

	from_date = filters.get("from_date")
	to_date = filters.get("to_date")

	if not to_date:
		to_date = getdate()

	permitted_fields = frappe.model.get_permitted_fields("Employee", user=frappe.session.user)

	hiring = (
		get_records(from_date, to_date, "date_of_joining", filters.get("company"))
		if "date_of_joining" in permitted_fields
		else []
	)

	attrition = (
		get_records(from_date, to_date, "relieving_date", filters.get("company"))
		if "relieving_date" in permitted_fields
		else []
	)

	hiring_data = get_result(hiring, filters.get("time_interval"), from_date, to_date, "Count")
	attrition_data = get_result(attrition, filters.get("time_interval"), from_date, to_date, "Count")

	return {
		"labels": [get_period(r[0], filters.get("time_interval")) for r in hiring_data],
		"datasets": [
			{"name": _("Hiring Count"), "values": [r[1] for r in hiring_data]},
			{"name": _("Attrition Count"), "values": [r[1] for r in attrition_data]},
		],
	}


def get_records(from_date: str, to_date: str, datefield: str, company: str) -> tuple[tuple[str, float, int]]:
	from frappe.query_builder.functions import Count
	
	Employee = frappe.qb.DocType("Employee")
	date_field = getattr(Employee, datefield)
	
	query = (
		frappe.qb.from_(Employee)
		.select(date_field.as_("_unit"), Count("*").as_("count"))
		.where(Employee.company == company)
		.where(date_field >= from_date)
		.where(date_field <= to_date)
		.where(date_field.isnotnull())
		.groupby(date_field)
		.orderby(date_field)
	)
	
	data = query.run(as_list=True)
	# Return in format expected by get_result: (date, count, count)
	return [(row[0], row[1], row[1]) for row in data] if data else []
