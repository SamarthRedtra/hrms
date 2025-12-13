import frappe


def execute():
	component = "Absenteeism Penalty"
	if frappe.db.exists("Salary Component", component):
		return

	doc = frappe.new_doc("Salary Component")
	doc.salary_component = component
	doc.type = "Deduction"
	doc.description = "Extra one-day deduction per absent day when enabled on Shift Type."
	doc.insert(ignore_if_duplicate=True)
