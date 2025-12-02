#!/usr/bin/env python3
"""
Debug script to check how attendance is being processed for flexible shifts.
Run: bench --site <site-name> execute hrms.debug_attendance.check_shift --kwargs "{'shift_name': 'Night Shift', 'employee': 'EMP-00001'}"
"""

import frappe
from frappe.utils import getdate


def check_shift(shift_name, employee=None):
	"""Check how logs are being grouped for a shift."""
	shift = frappe.get_doc("Shift Type", shift_name)
	
	print(f"\n{'='*80}")
	print(f"Shift: {shift_name}")
	print(f"Enable Flexible Log Pairing: {shift.enable_flexible_log_pairing}")
	print(f"Determine Check-in/out: {shift.determine_check_in_and_check_out}")
	print(f"{'='*80}\n")
	
	# Get checkins
	filters = {
		"skip_auto_attendance": 0,
		"attendance": ("is", "not set"),
		"shift": shift.name,
		"offshift": 0,
	}
	
	if employee:
		filters["employee"] = employee
	
	logs = frappe.get_all(
		"Employee Checkin",
		fields=[
			"name",
			"employee",
			"log_type",
			"time",
			"shift",
			"shift_start",
			"shift_end",
		],
		filters=filters,
		order_by="employee, time",
	)
	
	print(f"Found {len(logs)} unprocessed checkins:\n")
	
	for log in logs:
		print(f"  {log.name}")
		print(f"    Employee: {log.employee}")
		print(f"    Time: {log.time}")
		print(f"    Log Type: {log.log_type}")
		print(f"    Shift Start: {log.shift_start}")
		print(f"    Shift End: {log.shift_end}")
		print()
	
	# Show how they would be grouped
	if shift.enable_flexible_log_pairing:
		print("\nFlexible Pairing - Grouping by IN date:")
		print("-" * 80)
		grouped = shift._group_logs_by_in_time(logs)
		for key, group in grouped:
			employee_id, in_date = key
			group_logs = list(group)
			print(f"\n  Group: {employee_id} - {in_date}")
			print(f"  Logs in group: {len(group_logs)}")
			for log in group_logs:
				print(f"    - {log['time']} ({log.get('log_type', 'N/A')})")
	else:
		print("\nStandard Grouping - Grouping by shift_start:")
		print("-" * 80)
		from itertools import groupby
		group_key = lambda x: (x["employee"], x["shift_start"])
		for key, group in groupby(sorted(logs, key=group_key), key=group_key):
			employee_id, shift_start = key
			group_logs = list(group)
			print(f"\n  Group: {employee_id} - {shift_start.date()}")
			print(f"  Logs in group: {len(group_logs)}")
			for log in group_logs:
				print(f"    - {log['time']} ({log.get('log_type', 'N/A')})")
	
	print(f"\n{'='*80}\n")


if __name__ == "__main__":
	# For testing
	frappe.init(site="your-site-name")
	frappe.connect()
	check_shift("Night Shift", "EMP-00001")

