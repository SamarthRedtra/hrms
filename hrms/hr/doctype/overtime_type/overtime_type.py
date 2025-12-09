# Copyright (c) 2024, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class OvertimeType(Document):
	def validate(self):
		if self.overtime_calculation_method == "Salary Component Based":
			self.validate_applicable_components()
		elif self.overtime_calculation_method == "Gross Based":
			self.validate_gross_percentage()

	def validate_applicable_components(self):
		if not len(self.applicable_salary_component):
			frappe.throw(_("Select Applicable Components for Overtime Type"))

	def validate_gross_percentage(self):
		from frappe.utils import flt

		if not self.gross_percentage or flt(self.gross_percentage) <= 0:
			frappe.throw(_("Gross Percentage must be greater than 0 for Gross Based calculation"))
		if flt(self.gross_percentage) > 100:
			frappe.throw(_("Gross Percentage cannot exceed 100%"))
