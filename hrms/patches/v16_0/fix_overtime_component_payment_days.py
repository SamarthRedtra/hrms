import frappe


def execute():
	"""
	Fix Overtime salary component to not depend on payment days.

	Overtime should be a fixed amount earned for extra hours worked,
	not prorated based on attendance days.
	"""

	frappe.db.sql("""
		UPDATE `tabSalary Component`
		SET depends_on_payment_days = 0
		WHERE salary_component = 'Overtime'
	""")

	frappe.db.commit()

	# Log the completion
	frappe.logger().info("Updated Overtime salary component to not depend on payment days")