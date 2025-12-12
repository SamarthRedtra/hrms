# Copyright (c) 2024, HRMS App
# License: GNU General Public License v3. See license.txt

import frappe
from frappe.desk.doctype.desktop_icon.desktop_icon import DesktopIcon as OriginalDesktopIcon


class DesktopIcon(OriginalDesktopIcon):
	"""
	Override DesktopIcon to show all icons to all users (similar to Administrator).
	This allows all users to see the same desktop icons as Administrator.
	"""

	def is_permitted(self, bootinfo):
		"""
		Override is_permitted to always return True for all users.
		This makes all users see the same icons as Administrator.
		"""
		# Return True for all users - showing all icons like Administrator
		return True

