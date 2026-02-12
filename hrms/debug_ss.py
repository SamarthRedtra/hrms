import frappe
from frappe.utils import add_days, getdate

def debug_salary_slip():
    """Debug salary slip calculation"""
    emp = "EMP-00001"
    
    # Get the salary slip
    ss_name = frappe.db.get_value("Salary Slip", {"employee": emp}, order_by="creation desc")
    if not ss_name:
        print("No salary slip found")
        return
        
    ss = frappe.get_doc("Salary Slip", ss_name)
    
    print(f"\n=== Salary Slip Debug ===")
    print(f"Employee: {ss.employee}")
    print(f"Start Date: {ss.start_date}")
    print(f"End Date: {ss.end_date}")
    print(f"Actual Start Date: {ss.actual_start_date}")
    print(f"Actual End Date: {ss.actual_end_date}")
    print(f"Total Working Days: {ss.total_working_days}")
    print(f"Payment Days: {ss.payment_days}")
    print(f"Absent Days: {ss.absent_days}")
    print(f"Leave Without Pay: {ss.leave_without_pay}")
    
    # Check attendance records
    attendance = frappe.qb.DocType("Attendance")
    records = (
        frappe.qb.from_(attendance)
        .select(attendance.attendance_date, attendance.status)
        .where(
            (attendance.employee == emp)
            & (attendance.docstatus == 1)
            & (attendance.attendance_date.between(ss.start_date, ss.end_date))
        )
        .orderby(attendance.attendance_date)
    ).run(as_dict=1)
    
    print(f"\nAttendance Records ({len(records)} total):")
    present = 0
    absent = 0
    for r in records:
        print(f"  {r.attendance_date}: {r.status}")
        if r.status == "Present":
            present += 1
        elif r.status == "Absent":
            absent += 1
    
    print(f"\nPresent: {present}, Absent: {absent}")
    
    # Check payroll settings
    payroll_based_on = frappe.db.get_single_value("Payroll Settings", "payroll_based_on")
    print(f"\nPayroll Based On: {payroll_based_on}")

if __name__ == "__main__":
    frappe.connect()
    debug_salary_slip()
