import frappe


def execute():
	"""
	Add new field 'treat_holiday_hours_as_full_overtime' to Overtime Type doctype.
	"""

	# Check if the field already exists
	if not frappe.db.has_column("Overtime Type", "treat_holiday_hours_as_full_overtime"):
		# Add the new field to Overtime Type
		frappe.db.sql("""
			ALTER TABLE `tabOvertime Type`
			ADD COLUMN `treat_holiday_hours_as_full_overtime` TINYINT(1) NOT NULL DEFAULT 0
			AFTER `weekend_multiplier`
		""")

		# Update the DocType JSON if needed
		overtime_type_path = frappe.get_app_path("hrms", "hr", "doctype", "overtime_type", "overtime_type.json")
		if frappe.get_file_json(overtime_type_path):
			doc_json = frappe.get_file_json(overtime_type_path)
			field_order = doc_json.get("field_order", [])
			fields = doc_json.get("fields", [])

			# Check if field is already in field_order
			if "treat_holiday_hours_as_full_overtime" not in field_order:
				# Find weekend_multiplier index and add after it
				try:
					weekend_idx = field_order.index("weekend_multiplier")
					field_order.insert(weekend_idx + 1, "treat_holiday_hours_as_full_overtime")
				except ValueError:
					field_order.append("treat_holiday_hours_as_full_overtime")

			# Check if field definition exists
			field_exists = any(f.get("fieldname") == "treat_holiday_hours_as_full_overtime" for f in fields)
			if not field_exists:
				# Add field definition
				new_field = {
					"default": "0",
					"description": "If enabled, all hours worked on weekends and public holidays will be treated as full overtime hours (no standard working hours split). All hours will be multiplied by the respective holiday/weekend multiplier.",
					"fieldname": "treat_holiday_hours_as_full_overtime",
					"fieldtype": "Check",
					"label": "Treat Holiday Hours as Full Overtime"
				}
				fields.append(new_field)

			# Save updated JSON
			import json
			with open(overtime_type_path, "w") as f:
				json.dump(doc_json, f, indent=1)

	# Clear cache to ensure the new field is available
	frappe.clear_cache()

	# Log the completion
	frappe.logger().info("Added treat_holiday_hours_as_full_overtime field to Overtime Type")