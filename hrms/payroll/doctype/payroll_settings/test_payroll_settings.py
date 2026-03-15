# Copyright (c) 2020, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

from hrms.payroll.doctype.payroll_settings.payroll_settings import (
	bulk_add_component_to_submitted_salary_structures,
)
from hrms.payroll.doctype.salary_structure.test_salary_structure import make_salary_structure


class TestPayrollSettings(FrappeTestCase):
	def setUp(self):
		for dt in [
			"Salary Detail",
			"Salary Structure Assignment",
			"Salary Slip",
			"Salary Structure",
			"Salary Component",
			"Salary Component Account",
		]:
			frappe.db.delete(dt)

		self.set_bulk_update_settings(enabled=0)

	def test_bulk_add_earning_component_to_submitted_salary_structures(self):
		component = make_test_salary_component(
			"Bulk Update Earning Component",
			"Earning",
			salary_component_abbr="BUEC",
			amount_based_on_formula=1,
			formula="base * 0.1",
			condition="base > 0",
			depends_on_payment_days=0,
		)
		structure_to_update = make_salary_structure("Bulk Update Salary Structure 1", "Monthly")
		structure_with_existing_component = make_salary_structure(
			"Bulk Update Salary Structure 2", "Monthly", dont_submit=True
		)
		structure_with_existing_component.append(
			"earnings",
			{"salary_component": component.name, "amount_based_on_formula": 1, "formula": "base * 0.1"},
		)
		structure_with_existing_component.submit()

		cancelled_structure = make_salary_structure("Bulk Update Salary Structure 3", "Monthly")
		cancelled_structure.cancel()

		self.set_bulk_update_settings(enabled=1, component_type="Earning", salary_component=component.name)
		result = bulk_add_component_to_submitted_salary_structures("Earning", component.name)

		self.assertEqual(result["updated_count"], 1)
		self.assertEqual(result["skipped_existing_count"], 1)
		self.assertEqual(result["skipped_cancelled_count"], 1)

		structure_to_update.reload()
		updated_row = next(
			(row for row in structure_to_update.earnings if row.salary_component == component.name), None
		)
		self.assertIsNotNone(updated_row)
		self.assertEqual(updated_row.formula, "base * 0.1")
		self.assertEqual(updated_row.condition, "base > 0")
		self.assertEqual(updated_row.amount_based_on_formula, 1)
		self.assertEqual(updated_row.abbr, "BUEC")

		cancelled_structure.reload()
		self.assertFalse(
			any(row.salary_component == component.name for row in cancelled_structure.earnings)
		)

	def test_bulk_add_deduction_component_to_submitted_salary_structures(self):
		component = make_test_salary_component(
			"Bulk Update Deduction Component",
			"Deduction",
			salary_component_abbr="BUDC",
			amount=250,
			exempted_from_income_tax=1,
		)
		structure_to_update = make_salary_structure("Bulk Update Deduction Structure 1", "Monthly")
		structure_with_existing_component = make_salary_structure(
			"Bulk Update Deduction Structure 2", "Monthly", dont_submit=True
		)
		structure_with_existing_component.append(
			"deductions", {"salary_component": component.name, "amount": 250}
		)
		structure_with_existing_component.submit()

		self.set_bulk_update_settings(enabled=1, component_type="Deduction", salary_component=component.name)
		result = bulk_add_component_to_submitted_salary_structures("Deduction", component.name)

		self.assertEqual(result["updated_count"], 1)
		self.assertEqual(result["skipped_existing_count"], 1)
		self.assertEqual(result["skipped_cancelled_count"], 0)

		structure_to_update.reload()
		updated_row = next(
			(row for row in structure_to_update.deductions if row.salary_component == component.name), None
		)
		self.assertIsNotNone(updated_row)
		self.assertEqual(updated_row.amount, 250)
		self.assertEqual(updated_row.exempted_from_income_tax, 1)
		self.assertEqual(updated_row.abbr, "BUDC")

	def test_bulk_add_requires_setting_to_be_enabled(self):
		component = make_test_salary_component(
			"Bulk Update Disabled Setting Component",
			"Earning",
			salary_component_abbr="BUDS",
			amount=100,
		)
		make_salary_structure("Bulk Update Disabled Structure", "Monthly")

		self.set_bulk_update_settings(enabled=0, component_type="Earning", salary_component=component.name)

		self.assertRaises(
			frappe.ValidationError,
			bulk_add_component_to_submitted_salary_structures,
			"Earning",
			component.name,
		)

	def set_bulk_update_settings(self, enabled, component_type=None, salary_component=None):
		frappe.db.set_single_value(
			"Payroll Settings",
			"enable_bulk_component_update_for_submitted_salary_structures",
			enabled,
		)
		frappe.db.set_single_value("Payroll Settings", "bulk_component_update_type", component_type or "")
		frappe.db.set_single_value("Payroll Settings", "bulk_component_to_add", salary_component or "")
		frappe.clear_cache(doctype="Payroll Settings")


def make_test_salary_component(component_name, component_type, **kwargs):
	if frappe.db.exists("Salary Component", component_name):
		frappe.delete_doc("Salary Component", component_name, force=True)

	doc = frappe.get_doc(
		{
			"doctype": "Salary Component",
			"salary_component": component_name,
			"salary_component_abbr": kwargs.pop("salary_component_abbr", "BULK"),
			"type": component_type,
			"amount": kwargs.pop("amount", 0),
			"is_tax_applicable": kwargs.pop("is_tax_applicable", 0 if component_type == "Deduction" else 1),
			"depends_on_payment_days": kwargs.pop("depends_on_payment_days", 1),
			"amount_based_on_formula": kwargs.pop("amount_based_on_formula", 0),
			"formula": kwargs.pop("formula", ""),
			"condition": kwargs.pop("condition", ""),
			"exempted_from_income_tax": kwargs.pop("exempted_from_income_tax", 0),
			**kwargs,
		}
	).insert()
	return doc
