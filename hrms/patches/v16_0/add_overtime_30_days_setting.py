import frappe


def execute():
	"""
	Add new payroll setting for overtime calculation based on 30 days
	and update overtime calculation logic to use gross salary.
	"""

	# Payroll Settings is a single doctype, so we just need to ensure the field exists in the JSON
	# No database table alteration needed for single doctypes

		# Update the DocType JSON
	payroll_settings_path = frappe.get_app_path("hrms", "payroll", "doctype", "payroll_settings", "payroll_settings.json")
	if frappe.get_file_json(payroll_settings_path):
		doc_json = frappe.get_file_json(payroll_settings_path)
		if "calculate_overtime_based_on_30_days" not in [f["fieldname"] for f in doc_json.get("fields", [])]:
			# Find the index of strict_weekoff_leave_holiday_policy
			fields = doc_json.get("fields", [])
			insert_index = -1
			for i, field in enumerate(fields):
				if field.get("fieldname") == "strict_weekoff_leave_holiday_policy":
					insert_index = i + 1
					break

			if insert_index > 0:
				new_field = {
					"default": "0",
					"description": "If enabled, overtime calculation will be based on 30 days salary regardless of actual working days/attendance",
					"fieldname": "calculate_overtime_based_on_30_days",
					"fieldtype": "Check",
					"label": "Calculate Overtime Based on 30 Days Salary"
				}
				fields.insert(insert_index, new_field)

				# Also update field_order if it exists
				if "field_order" in doc_json:
					field_order = doc_json["field_order"]
					strict_index = -1
					for i, fname in enumerate(field_order):
						if fname == "strict_weekoff_leave_holiday_policy":
							strict_index = i + 1
							break

					if strict_index > 0:
						field_order.insert(strict_index, "calculate_overtime_based_on_30_days")

				# Save the updated JSON
				import json
				with open(payroll_settings_path, "w") as f:
					json.dump(doc_json, f, indent=1)

	# Clear cache to ensure the new field is available
	frappe.clear_cache()

	# Log the completion
	frappe.logger().info("Added calculate_overtime_based_on_30_days setting to Payroll Settings")