import frappe
from frappe.utils import getdate

def debug_attendance_issue(employee, start_date, end_date):
    """
    Debug attendance calculation for salary slip
    """
    print(f"\n=== Debugging Attendance for {employee} ===")
    print(f"Period: {start_date} to {end_date}")
    
    # Get employee details
    emp_doc = frappe.get_doc("Employee", employee)
    print(f"Joining Date: {emp_doc.date_of_joining}")
    
    # Get all attendance records
    attendance = frappe.qb.DocType("Attendance")
    all_records = (
        frappe.qb.from_(attendance)
        .select(
            attendance.attendance_date,
            attendance.status,
            attendance.leave_type,
        )
        .where(
            (attendance.employee == employee)
            & (attendance.docstatus == 1)
            & (attendance.attendance_date.between(start_date, end_date))
        )
        .orderby(attendance.attendance_date)
    ).run(as_dict=1)
    
    print(f"\nTotal Attendance Records: {len(all_records)}")
    present_count = 0
    absent_count = 0
    
    for record in all_records:
        print(f"{record.attendance_date}: {record.status}")
        if record.status == "Present":
            present_count += 1
        elif record.status == "Absent":
            absent_count += 1
    
    print(f"\nPresent Days: {present_count}")
    print(f"Absent Days: {absent_count}")
    
    # Check Salary Structure Assignment
    ssa = frappe.db.get_value(
        "Salary Structure Assignment",
        {
            "employee": employee,
            "docstatus": 1,
            "from_date": ["<=", end_date]
        },
        ["from_date", "salary_structure"],
        order_by="from_date desc",
        as_dict=True
    )
    
    if ssa:
        print(f"\nSalary Structure Assignment:")
        print(f"  From Date: {ssa.from_date}")
        print(f"  Structure: {ssa.salary_structure}")

if __name__ == "__main__":
    frappe.connect()
    # Replace with your employee ID
    debug_attendance_issue("EMP-ID-HERE", "2024-12-26", "2025-01-25")
