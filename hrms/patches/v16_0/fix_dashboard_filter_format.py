# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# License: GNU General Public License v3. See license.txt

import re

import frappe


def execute():
	"""Fix dashboard chart and number card filter formats for Frappe 16 compatibility.
	
	Frappe 16 no longer supports the 5-element filter format with boolean at the end.
	This patch converts:
		["DocType","field","=","value",false] -> ["DocType","field","=","value"]
		["DocType","field","=","value",true] -> ["DocType","field","=","value"]
	"""
	fix_dashboard_charts()
	fix_number_cards()


def fix_dashboard_charts():
	"""Fix filters_json in Dashboard Chart records."""
	charts = frappe.get_all(
		"Dashboard Chart",
		filters={"module": ["in", ["HR", "Payroll"]]},
		fields=["name", "filters_json", "dynamic_filters_json"],
	)
	
	for chart in charts:
		updated = False
		
		if chart.filters_json:
			new_filters = fix_filter_format(chart.filters_json)
			if new_filters != chart.filters_json:
				frappe.db.set_value("Dashboard Chart", chart.name, "filters_json", new_filters, update_modified=False)
				updated = True
		
		if chart.dynamic_filters_json:
			new_dynamic_filters = fix_filter_format(chart.dynamic_filters_json)
			if new_dynamic_filters != chart.dynamic_filters_json:
				frappe.db.set_value("Dashboard Chart", chart.name, "dynamic_filters_json", new_dynamic_filters, update_modified=False)
				updated = True
		
		if updated:
			frappe.db.commit()


def fix_number_cards():
	"""Fix filters_json in Number Card records."""
	cards = frappe.get_all(
		"Number Card",
		filters={"module": ["in", ["HR", "Payroll"]]},
		fields=["name", "filters_json", "dynamic_filters_json"],
	)
	
	for card in cards:
		updated = False
		
		if card.filters_json:
			new_filters = fix_filter_format(card.filters_json)
			if new_filters != card.filters_json:
				frappe.db.set_value("Number Card", card.name, "filters_json", new_filters, update_modified=False)
				updated = True
		
		if card.dynamic_filters_json:
			new_dynamic_filters = fix_filter_format(card.dynamic_filters_json)
			if new_dynamic_filters != card.dynamic_filters_json:
				frappe.db.set_value("Number Card", card.name, "dynamic_filters_json", new_dynamic_filters, update_modified=False)
				updated = True
		
		if updated:
			frappe.db.commit()


def fix_filter_format(filters_json: str) -> str:
	"""Remove the trailing boolean from filter arrays.
	
	Converts:
		["DocType","field","=","value",false] -> ["DocType","field","=","value"]
		["DocType","field","=","value",true] -> ["DocType","field","=","value"]
	"""
	if not filters_json:
		return filters_json
	
	# Remove ,false] and ,true] patterns (case insensitive)
	result = re.sub(r',\s*(false|true)\s*\]', ']', filters_json, flags=re.IGNORECASE)
	return result

