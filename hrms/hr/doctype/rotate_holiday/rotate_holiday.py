# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


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


def is_rotate_holiday(employee: str, date) -> bool:
	"""Check if the given date is a rotate holiday for the employee.
	
	Args:
		employee: Employee ID
		date: Date to check
		
	Returns:
		True if the date is a rotate holiday for the employee, False otherwise
	"""
	return frappe.db.exists("Rotate Holiday", {"employee": employee, "date": getdate(date)})


def get_rotate_holidays_for_employee(employee: str, start_date, end_date) -> list:
	"""Get all rotate holidays for an employee within a date range.
	
	Args:
		employee: Employee ID
		start_date: Start date of the range
		end_date: End date of the range
		
	Returns:
		List of rotate holiday dates
	"""
	return frappe.get_all(
		"Rotate Holiday",
		filters={
			"employee": employee,
			"date": ["between", [getdate(start_date), getdate(end_date)]],
		},
		pluck="date",
	)

