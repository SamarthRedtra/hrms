# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, getdate, today

from hrms.hr.doctype.rotate_holiday.rotate_holiday import (
	get_rotate_holidays_for_employee,
	get_rotate_off_days_for_employee,
	is_rotate_off_day,
	is_rotate_working_day,
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

	def test_is_rotate_working_day(self):
		"""Test the is_rotate_working_day helper function.
		
		When a Rotate Holiday entry exists for a date, that date is a working day.
		"""
		employee = frappe.db.get_value("Employee", {"status": "Active"}, "name")
		if not employee:
			self.skipTest("No active employee found")

		test_date = add_days(today(), 20)  # Sunday equivalent

		# Should return False before creating
		self.assertFalse(is_rotate_working_day(employee, test_date))

		# Create rotate holiday entry for Sunday
		frappe.get_doc(
			{
				"doctype": "Rotate Holiday",
				"employee": employee,
				"date": test_date,
			}
		).insert()

		# Sunday should now be a working day
		self.assertTrue(is_rotate_working_day(employee, test_date))

	def test_is_rotate_off_day(self):
		"""Test the is_rotate_off_day helper function.
		
		When a Rotate Holiday entry exists for the NEXT day, THIS day is an off day.
		Example: Entry on Sunday → Saturday is off day
		"""
		employee = frappe.db.get_value("Employee", {"status": "Active"}, "name")
		if not employee:
			self.skipTest("No active employee found")

		sunday = add_days(today(), 21)
		saturday = add_days(sunday, -1)

		# Saturday should not be an off day initially
		self.assertFalse(is_rotate_off_day(employee, saturday))

		# Create rotate holiday entry for Sunday
		frappe.get_doc(
			{
				"doctype": "Rotate Holiday",
				"employee": employee,
				"date": sunday,
			}
		).insert()

		# Saturday should now be an off day (because Sunday has the entry)
		self.assertTrue(is_rotate_off_day(employee, saturday))
		
		# Sunday should NOT be an off day (it has the entry, so it's a working day)
		self.assertFalse(is_rotate_off_day(employee, sunday))

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

	def test_get_rotate_off_days_for_employee(self):
		"""Test the get_rotate_off_days_for_employee helper function."""
		employee = frappe.db.get_value("Employee", {"status": "Active"}, "name")
		if not employee:
			self.skipTest("No active employee found")

		# Create entry for day 52 (making day 51 an off day)
		entry_date = add_days(today(), 52)
		off_day = add_days(entry_date, -1)  # day 51

		frappe.get_doc(
			{
				"doctype": "Rotate Holiday",
				"employee": employee,
				"date": entry_date,
			}
		).insert()

		# Check that day 51 is returned as an off day
		start_date = add_days(today(), 50)
		end_date = add_days(today(), 55)
		
		off_days = get_rotate_off_days_for_employee(employee, start_date, end_date)
		self.assertEqual(len(off_days), 1)
		self.assertEqual(getdate(off_days[0]), getdate(off_day))
