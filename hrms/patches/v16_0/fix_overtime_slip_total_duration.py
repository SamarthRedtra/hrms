
import frappe

def execute():
	frappe.reload_doc("hr", "doctype", "overtime_slip")
	
	overtime_slips = frappe.get_all("Overtime Slip", fields=["name"])
	for slip in overtime_slips:
		doc = frappe.get_doc("Overtime Slip", slip.name)
		# Recalculate total duration
		doc.calculate_total_overtime_duration()
		
		# Update the field in DB without triggering full validation/save 
		# to avoid side effects on submitted docs (though submit validation might be needed if logic changed)
		# However, since we just want to correct the total based on children, db_set is safer for submitted docs
		# But wait, normal_ot_hours and holiday_ot_hours are also calculated on submit.
		# If the total is wrong, likely the breakdown is also wrong if it was based on total?
		# No, breakdown is calculated from children in `process_overtime_slip` (on submit).
		# The issue verification showed that breakdown (on submit) was correct (3.0), but total field was wrong (2.0).
		# So we only need to fix `total_overtime_duration` to match the children sum.
		
		doc.db_set("total_overtime_duration", doc.total_overtime_duration, update_modified=False)

