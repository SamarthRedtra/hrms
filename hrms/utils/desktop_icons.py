# Copyright (c) 2024, HRMS App
# License: GNU General Public License v3. See license.txt

import frappe


def patch_get_desktop_icons():
	"""
	Monkey patch get_desktop_icons to ensure all icons are shown with proper hierarchy.
	This ensures parent icons and their children are all visible to all users.
	"""
	# Import here to avoid circular imports
	from frappe.desk.doctype.desktop_icon.desktop_icon import (
		get_desktop_icons as original_get_desktop_icons,
	)
	
	import frappe.desk.doctype.desktop_icon.desktop_icon as desktop_icon_module
	
	# Save original function if not already saved
	if not hasattr(desktop_icon_module, '_hrms_original_get_desktop_icons'):
		desktop_icon_module._hrms_original_get_desktop_icons = original_get_desktop_icons
	
	# Define the patched function
	def get_desktop_icons(user=None, bootinfo=None):
		"""
		Override get_desktop_icons to ensure all icons are shown with proper hierarchy.
		This ensures parent icons and their children are all visible to all users.
		"""
		if not user:
			user = frappe.session.user

		user_icons = frappe.cache.hget("desktop_icons", user)

		if not user_icons:
			# Call original function to get all icons
			original_func = desktop_icon_module._hrms_original_get_desktop_icons
			user_icons = original_func(user=user, bootinfo=bootinfo)
			
			# Build a set of all icon labels AND names for hierarchy checking
			# Some icons use label, some use name as the parent reference
			all_icon_labels = set()
			for icon in user_icons:
				if icon.get("label"):
					all_icon_labels.add(icon.get("label"))
				if icon.get("name"):
					all_icon_labels.add(icon.get("name"))
			
			# Filter to ensure hierarchy is maintained:
			# 1. Include all icons without parent_icon (top-level icons)
			# 2. Include all icons whose parent_icon exists in the icon set
			# This ensures parent-child relationships are preserved
			filtered_icons = []
			for icon in user_icons:
				parent_icon = icon.get("parent_icon")
				# Include if no parent, or if parent exists in the icon set
				if not parent_icon or parent_icon in all_icon_labels:
					filtered_icons.append(icon)
			
			user_icons = filtered_icons
			
			# Cache the result
			frappe.cache.hset("desktop_icons", user, user_icons)
		
		return user_icons
	
	# Apply the monkey patch
	desktop_icon_module.get_desktop_icons = get_desktop_icons

