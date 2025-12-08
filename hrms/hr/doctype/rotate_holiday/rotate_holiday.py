# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, getdate


class RotateHoliday(Document):
	def validate(self):
		self.set_day_from_date()
		self.validate_duplicate()

	def set_day_from_date(self):
		"""Set the day of the week from the date."""
		if self.date:
			self.day = getdate(self.date).strftime("%A")

	def validate_duplicate(self):
		"""Check for duplicate entry for same employee and date."""
		if frappe.db.exists(
			"Rotate Holiday",
			{"employee": self.employee, "date": self.date, "name": ("!=", self.name)},
		):
			frappe.throw(
				_("Rotate Holiday entry already exists for {0} on {1}").format(
					self.employee_name or self.employee, self.date
				)
			)


def is_rotate_working_day(employee: str, date) -> bool:
	"""Check if the given date is marked as a rotate working day for the employee.
	
	A rotate working day is when the employee has a Rotate Holiday entry for that date,
	meaning they are working on what would normally be a holiday.
	
	Args:
		employee: Employee ID
		date: Date to check
		
	Returns:
		True if the employee has a Rotate Holiday entry for this date (working day)
	"""
	return bool(frappe.db.exists("Rotate Holiday", {"employee": employee, "date": getdate(date)}))


def is_rotate_off_day(employee: str, date) -> bool:
	"""Check if the given date should be treated as a holiday due to rotate holiday.
	
	If an employee has a Rotate Holiday entry for the NEXT day, then THIS day
	becomes their off day (holiday).
	
	Example: Rotate Holiday entry on Sunday → Saturday becomes the off day (holiday)
	
	Args:
		employee: Employee ID
		date: Date to check
		
	Returns:
		True if the next day has a Rotate Holiday entry (making this day a holiday)
	"""
	next_day = add_days(getdate(date), 1)
	return bool(frappe.db.exists("Rotate Holiday", {"employee": employee, "date": next_day}))


def get_rotate_holidays_for_employee(employee: str, start_date, end_date) -> list:
	"""Get all rotate holiday dates for an employee within a date range.
	
	Args:
		employee: Employee ID
		start_date: Start date of the range
		end_date: End date of the range
		
	Returns:
		List of rotate holiday dates (dates employee is working)
	"""
	return frappe.get_all(
		"Rotate Holiday",
		filters={
			"employee": employee,
			"date": ["between", [getdate(start_date), getdate(end_date)]],
		},
		pluck="date",
	)


def get_rotate_off_days_for_employee(employee: str, start_date, end_date) -> list:
	"""Get all rotate off days for an employee within a date range.
	
	These are the days BEFORE each Rotate Holiday entry that become holidays.
	
	Args:
		employee: Employee ID
		start_date: Start date of the range
		end_date: End date of the range
		
	Returns:
		List of dates that are off days due to rotate holiday
	"""
	# Get rotate holiday entries, but we need entries where the previous day falls in range
	rotate_entries = frappe.get_all(
		"Rotate Holiday",
		filters={
			"employee": employee,
			"date": ["between", [add_days(getdate(start_date), 1), add_days(getdate(end_date), 1)]],
		},
		pluck="date",
	)
	
	# Return the day before each rotate holiday entry
	off_days = []
	for entry_date in rotate_entries:
		off_day = add_days(getdate(entry_date), -1)
		if getdate(start_date) <= off_day <= getdate(end_date):
			off_days.append(off_day)
	
	return off_days
