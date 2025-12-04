# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, getdate, today

from hrms.hr.doctype.rotate_holiday.rotate_holiday import (
	get_rotate_holidays_for_employee,
	is_rotate_holiday,
)


class TestRotateHoliday(IntegrationTestCase):
	def setUp(self):
		# Clean up any existing test data
		frappe.db.delete("Rotate Holiday", {"employee": ["like", "TEST-%"]})

	def test_rotate_holiday_creation(self):
		"""Test that rotate holiday can be created with required fields."""
		employee = frappe.db.get_value("Employee", {"status": "Active"}, "name")
		if not employee:
			self.skipTest("No active employee found")

		rotate_holiday = frappe.get_doc(
			{
				"doctype": "Rotate Holiday",
				"employee": employee,
				"date": today(),
			}
		)
		rotate_holiday.insert()

		self.assertTrue(rotate_holiday.name)
		self.assertEqual(rotate_holiday.day, getdate(today()).strftime("%A"))

	def test_duplicate_validation(self):
		"""Test that duplicate entries for same employee and date are not allowed."""
		employee = frappe.db.get_value("Employee", {"status": "Active"}, "name")
		if not employee:
			self.skipTest("No active employee found")

		test_date = add_days(today(), 10)

		# Create first entry
		rotate_holiday1 = frappe.get_doc(
			{
				"doctype": "Rotate Holiday",
				"employee": employee,
				"date": test_date,
			}
		)
		rotate_holiday1.insert()

		# Try to create duplicate
		rotate_holiday2 = frappe.get_doc(
			{
				"doctype": "Rotate Holiday",
				"employee": employee,
				"date": test_date,
			}
		)

		self.assertRaises(frappe.ValidationError, rotate_holiday2.insert)

	def test_is_rotate_holiday_function(self):
		"""Test the is_rotate_holiday helper function."""
		employee = frappe.db.get_value("Employee", {"status": "Active"}, "name")
		if not employee:
			self.skipTest("No active employee found")

		test_date = add_days(today(), 20)

		# Should return False before creating
		self.assertFalse(is_rotate_holiday(employee, test_date))

		# Create rotate holiday
		frappe.get_doc(
			{
				"doctype": "Rotate Holiday",
				"employee": employee,
				"date": test_date,
			}
		).insert()

		# Should return True after creating
		self.assertTrue(is_rotate_holiday(employee, test_date))

	def test_get_rotate_holidays_for_employee(self):
		"""Test the get_rotate_holidays_for_employee helper function."""
		employee = frappe.db.get_value("Employee", {"status": "Active"}, "name")
		if not employee:
			self.skipTest("No active employee found")

		start_date = add_days(today(), 30)
		end_date = add_days(today(), 40)

		# Create multiple rotate holidays
		for i in range(3):
			frappe.get_doc(
				{
					"doctype": "Rotate Holiday",
					"employee": employee,
					"date": add_days(start_date, i),
				}
			).insert()

		holidays = get_rotate_holidays_for_employee(employee, start_date, end_date)
		self.assertEqual(len(holidays), 3)

