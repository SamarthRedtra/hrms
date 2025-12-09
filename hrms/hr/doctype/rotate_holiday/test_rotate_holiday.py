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
		frappe.db.sql("DELETE FROM `tabRotate Holiday` WHERE employee LIKE 'TEST-%'")
		frappe.db.sql("DELETE FROM `tabAttendance` WHERE employee LIKE 'TEST-%'")

	def get_test_employee(self):
		"""Get or create a test employee."""
		employee = frappe.db.get_value("Employee", {"status": "Active"}, "name")
		if not employee:
			self.skipTest("No active employee found")
		return employee

	def create_attendance(self, employee, date, status="Present"):
		"""Helper to create and submit attendance."""
		company = frappe.db.get_value("Employee", employee, "company")
		attendance = frappe.get_doc({
			"doctype": "Attendance",
			"employee": employee,
			"attendance_date": date,
			"status": status,
			"company": company,
		})
		attendance.insert(ignore_permissions=True)
		attendance.submit()
		return attendance

	def test_rotate_holiday_requires_attendance(self):
		"""Test that rotate holiday requires attendance on the entry date."""
		employee = self.get_test_employee()
		test_date = add_days(today(), 100)

		# Try to create without attendance - should fail
		rotate_holiday = frappe.get_doc({
			"doctype": "Rotate Holiday",
			"employee": employee,
			"date": test_date,
		})

		self.assertRaises(frappe.ValidationError, rotate_holiday.insert)

	def test_rotate_holiday_blocks_if_both_days_present(self):
		"""Test that rotate holiday is blocked if both days have Present attendance."""
		employee = self.get_test_employee()
		sunday = add_days(today(), 101)
		saturday = add_days(sunday, -1)

		# Create Present attendance for both days
		self.create_attendance(employee, saturday, "Present")
		self.create_attendance(employee, sunday, "Present")

		# Try to create rotate holiday - should fail
		rotate_holiday = frappe.get_doc({
			"doctype": "Rotate Holiday",
			"employee": employee,
			"date": sunday,
		})

		self.assertRaises(frappe.ValidationError, rotate_holiday.insert)

	def test_rotate_holiday_creates_off_day_attendance(self):
		"""Test that rotate holiday auto-creates attendance for the off day."""
		employee = self.get_test_employee()
		sunday = add_days(today(), 102)
		saturday = add_days(sunday, -1)

		# Create Present attendance only for Sunday
		self.create_attendance(employee, sunday, "Present")

		# Saturday should not have attendance yet
		self.assertFalse(
			frappe.db.exists("Attendance", {"employee": employee, "attendance_date": saturday})
		)

		# Create rotate holiday
		rotate_holiday = frappe.get_doc({
			"doctype": "Rotate Holiday",
			"employee": employee,
			"date": sunday,
		})
		rotate_holiday.insert()

		# Saturday should now have attendance marked as "On Leave"
		saturday_attendance = frappe.db.get_value(
			"Attendance",
			{"employee": employee, "attendance_date": saturday},
			["status"],
			as_dict=True,
		)
		self.assertIsNotNone(saturday_attendance)
		self.assertEqual(saturday_attendance.status, "On Leave")

	def test_duplicate_validation(self):
		"""Test that duplicate entries for same employee and date are not allowed."""
		employee = self.get_test_employee()
		test_date = add_days(today(), 103)

		# Create attendance for the date
		self.create_attendance(employee, test_date, "Present")

		# Create first entry
		rotate_holiday1 = frappe.get_doc({
			"doctype": "Rotate Holiday",
			"employee": employee,
			"date": test_date,
		})
		rotate_holiday1.insert()

		# Try to create duplicate - should fail
		rotate_holiday2 = frappe.get_doc({
			"doctype": "Rotate Holiday",
			"employee": employee,
			"date": test_date,
		})
		self.assertRaises(frappe.ValidationError, rotate_holiday2.insert)

	def test_is_rotate_working_day(self):
		"""Test the is_rotate_working_day helper function."""
		employee = self.get_test_employee()
		test_date = add_days(today(), 104)

		# Create attendance
		self.create_attendance(employee, test_date, "Present")

		# Should return False before creating rotate holiday
		self.assertFalse(is_rotate_working_day(employee, test_date))

		# Create rotate holiday
		frappe.get_doc({
			"doctype": "Rotate Holiday",
			"employee": employee,
			"date": test_date,
		}).insert()

		# Should return True after creating
		self.assertTrue(is_rotate_working_day(employee, test_date))

	def test_is_rotate_off_day(self):
		"""Test the is_rotate_off_day helper function.
		
		When a Rotate Holiday entry exists for the NEXT day, THIS day is an off day.
		Example: Entry on Sunday → Saturday is off day
		"""
		employee = self.get_test_employee()
		sunday = add_days(today(), 105)
		saturday = add_days(sunday, -1)

		# Create attendance for Sunday
		self.create_attendance(employee, sunday, "Present")

		# Saturday should not be an off day initially
		self.assertFalse(is_rotate_off_day(employee, saturday))

		# Create rotate holiday entry for Sunday
		frappe.get_doc({
			"doctype": "Rotate Holiday",
			"employee": employee,
			"date": sunday,
		}).insert()

		# Saturday should now be an off day (because Sunday has the entry)
		self.assertTrue(is_rotate_off_day(employee, saturday))

		# Sunday should NOT be an off day (it has the entry, so it's a working day)
		self.assertFalse(is_rotate_off_day(employee, sunday))

	def test_get_rotate_holidays_for_employee(self):
		"""Test the get_rotate_holidays_for_employee helper function."""
		employee = self.get_test_employee()
		start_date = add_days(today(), 110)
		end_date = add_days(today(), 120)

		# Create attendance and rotate holidays
		for i in range(3):
			date = add_days(start_date, i * 2)  # Create on days 110, 112, 114
			self.create_attendance(employee, date, "Present")
			frappe.get_doc({
				"doctype": "Rotate Holiday",
				"employee": employee,
				"date": date,
			}).insert()

		holidays = get_rotate_holidays_for_employee(employee, start_date, end_date)
		self.assertEqual(len(holidays), 3)

	def test_get_rotate_off_days_for_employee(self):
		"""Test the get_rotate_off_days_for_employee helper function."""
		employee = self.get_test_employee()

		# Create entry for a specific date
		entry_date = add_days(today(), 130)
		off_day = add_days(entry_date, -1)

		# Create attendance for entry date
		self.create_attendance(employee, entry_date, "Present")

		# Create rotate holiday
		frappe.get_doc({
			"doctype": "Rotate Holiday",
			"employee": employee,
			"date": entry_date,
		}).insert()

		# Check that off_day is returned
		start_date = add_days(today(), 125)
		end_date = add_days(today(), 135)

		off_days = get_rotate_off_days_for_employee(employee, start_date, end_date)
		self.assertEqual(len(off_days), 1)
		self.assertEqual(getdate(off_days[0]), getdate(off_day))
