import frappe


def execute():
	"""
	Fix existing overtime additional salary entries to prevent payment days adjustment.
	"""

	# Update existing overtime additional salary entries to overwrite salary structure amount
	frappe.db.sql("""
		UPDATE `tabAdditional Salary`
		SET overwrite_salary_structure_amount = 1
		WHERE ref_doctype = 'Overtime Slip'
		AND docstatus = 1
	""")

	frappe.db.commit()

	# Log the completion
	frappe.logger().info("Updated existing overtime additional salary entries to prevent payment days adjustment")