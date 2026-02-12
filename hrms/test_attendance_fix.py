import frappe
from hrms.payroll.doctype.salary_slip.test_salary_slip import make_employee_salary_slip
from hrms.payroll.doctype.salary_structure.test_salary_structure import create_salary_structure_assignment, make_salary_structure
from erpnext.setup.doctype.employee.test_employee import make_employee
from frappe.utils import getdate, add_days

frappe.enqueue = lambda *args, **kwargs: None

def create_user_strong(email):
    if frappe.db.exists("User", email):
        return
    
    user = frappe.new_doc("User")
    user.email = email
    user.first_name = email.split("@")[0]
    user.enabled = 1
    user.new_password = "StrongPassword!123"
    user.send_welcome_email = 0
    user.append("roles", {"role": "Employee"})
    user.insert(ignore_permissions=True)

def make_employee_custom(user_id, company="_Test Company", **kwargs):
    create_user_strong(user_id)
    try:
        emp = make_employee(user_id, company=company, **kwargs)
    except frappe.exceptions.DuplicateEntryError:
        emp = frappe.get_doc("Employee", {"user_id": user_id}).name
    
    if not frappe.db.get_value("Company", company, "default_holiday_list"):
        hl = frappe.get_all("Holiday List", limit=1)
        if hl:
            frappe.db.set_value("Company", company, "default_holiday_list", hl[0].name)
    
    return emp

def ensure_fiscal_year(date):
    from frappe.utils import getdate
    d = getdate(date)
    year = d.year
    if d.month < 4:
        start_year = year - 1
        end_year = year
    else:
        start_year = year
        end_year = year + 1
        
    fy_name = f"{start_year}-{end_year}"
    
    if not frappe.db.exists("Fiscal Year", fy_name):
        frappe.get_doc({
            "doctype": "Fiscal Year",
            "year": fy_name,
            "year_start_date": f"{start_year}-04-01",
            "year_end_date": f"{end_year}-03-31",
            "disabled": 0
        }).insert()
    return fy_name

def ensure_holiday_list():
    hl_name = "Standard Holiday List 3"
    if not frappe.db.exists("Holiday List", hl_name):
        hl = frappe.get_doc({
            "doctype": "Holiday List",
            "holiday_list_name": hl_name,
            "from_date": "2020-01-01",
            "to_date": "2030-12-31",
            "weekly_off": "Sunday"
        })
        hl.insert()
    
    frappe.db.set_value("Company", "_Test Company", "default_holiday_list", hl_name)

def test_attendance_with_mid_period_assignment():
    """
    Test case: Employee joins Dec 26, has attendance on Dec 26 & 27
    Salary Structure Assignment starts on Jan 25 (mid-period)
    Period: Dec 26 to Jan 25
    Expected: Should count both attendance records
    """
    frappe.db.set_single_value("Payroll Settings", "payroll_based_on", "Attendance")
    frappe.db.set_single_value("Payroll Settings", "use_fixed_30_days_for_payment_days_calculation", 0)
    ensure_fiscal_year("2024-12-26")
    ensure_fiscal_year("2025-01-25")
    ensure_holiday_list()
    frappe.db.commit()

    emp_email = "test_attendance_fix@example.com"
    emp = make_employee_custom(emp_email, date_of_joining="2024-12-26")
    
    # Create salary structure
    structure_name = "Test Attendance Structure"
    if not frappe.db.exists("Salary Structure", structure_name):
        make_salary_structure(structure_name, "Monthly", employee=emp, company="_Test Company")
    
    # Create assignment from Jan 25 (simulating mid-period assignment)
    create_salary_structure_assignment(emp, structure_name, from_date="2025-01-25", company="_Test Company")
    
    # Create attendance records
    for date in ["2024-12-26", "2024-12-27"]:
        if not frappe.db.exists("Attendance", {"employee": emp, "attendance_date": date}):
            att = frappe.new_doc("Attendance")
            att.employee = emp
            att.attendance_date = date
            att.status = "Present"
            att.company = "_Test Company"
            att.insert()
            att.submit()
    
    # Create remaining days as absent
    for i in range(2, 31):  # Dec 28 to Jan 25
        date = add_days("2024-12-26", i)
        if getdate(date) > getdate("2025-01-25"):
            break
        if not frappe.db.exists("Attendance", {"employee": emp, "attendance_date": date}):
            att = frappe.new_doc("Attendance")
            att.employee = emp
            att.attendance_date = date
            att.status = "Absent"
            att.company = "_Test Company"
            att.insert()
            att.submit()
    
    # Create salary slip
    ss = frappe.new_doc("Salary Slip")
    ss.employee = emp
    ss.start_date = "2024-12-26"
    ss.end_date = "2025-01-25"
    ss.posting_date = "2025-01-25"
    ss.insert()
    ss.process_salary_structure()
    ss.save()
    
    print(f"\n=== Test Results ===")
    print(f"Employee: {emp}")
    print(f"Period: {ss.start_date} to {ss.end_date}")
    print(f"Payment Days: {ss.payment_days}")
    print(f"Absent Days: {ss.absent_days}")
    print(f"Expected Payment Days: 2 (Dec 26 & 27 present)")
    print(f"Test {'PASSED' if ss.payment_days == 2 else 'FAILED'}")
    
    frappe.db.rollback()
    
if __name__ == "__main__":
    frappe.connect()
    frappe.local.flags.in_test = True
    try:
        test_attendance_with_mid_period_assignment()
    except Exception as e:
        import traceback
        traceback.print_exc()
