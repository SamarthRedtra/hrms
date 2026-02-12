
import frappe
from hrms.payroll.doctype.salary_slip.test_salary_slip import make_employee_salary_slip
from hrms.payroll.doctype.salary_structure.test_salary_structure import create_salary_structure_assignment, make_salary_structure
from hrms.payroll.doctype.salary_slip.salary_slip import SalarySlip
from erpnext.setup.doctype.employee.test_employee import make_employee
from frappe.utils import getdate

# Mock frappe.enqueue to avoid Redis connection errors
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
    
    # Ensure Company has holiday list
    if not frappe.db.get_value("Company", company, "default_holiday_list"):
        hl = frappe.get_all("Holiday List", limit=1)
        if hl:
            frappe.db.set_value("Company", company, "default_holiday_list", hl[0].name)
    
    return emp

def ensure_fiscal_year(date):
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
    hl_name = "Standard Holiday List 2"
    if not frappe.db.exists("Holiday List", hl_name):
        hl = frappe.get_doc({
            "doctype": "Holiday List",
            "holiday_list_name": hl_name,
            "from_date": "2020-01-01",
            "to_date": "2030-12-31",
            "weekly_off": "Sunday"
        })
        hl.insert()
    
    # Assign to Company
    frappe.db.set_value("Company", "_Test Company", "default_holiday_list", hl_name)

def reproduce():
    # Setup
    frappe.db.set_single_value("Payroll Settings", "use_fixed_30_days_for_payment_days_calculation", 1)
    ensure_fiscal_year("2024-01-31")
    ensure_holiday_list()
    frappe.db.commit()

    # Scenario 1: Emp3 (Joined Jan 2)
    emp3_email = "emp3_fixed_30_v4@example.com"
    emp3 = make_employee_custom(emp3_email, date_of_joining="2024-01-02")
    
    try:
        # Create SS and Assignment manually
        structure_name = "Monthly Salary Structure Test for Salary Slip"
        if not frappe.db.exists("Salary Structure", structure_name):
            make_salary_structure(structure_name, "Monthly", employee=emp3, company="_Test Company")
        
        # Assignment from joining date
        create_salary_structure_assignment(emp3, structure_name, from_date="2024-01-02", company="_Test Company")
        
        # Create Salary Slip
        # Use make_employee_salary_slip but pass salary_structure to reuse existing logic if possible, 
        # but modify posting_date only for the slip? No, it uses it for assignment.
        
        # Let's create SS manually
        ss_emp3 = frappe.new_doc("Salary Slip")
        ss_emp3.employee = emp3
        ss_emp3.start_date = "2024-01-01"
        ss_emp3.end_date = "2024-01-31"
        ss_emp3.posting_date = "2024-01-31"
        ss_emp3.insert()
        ss_emp3.process_salary_structure() # This loads details
        ss_emp3.save()
        
        print(f"Emp3 (Joined Jan 2): Payment Days = {ss_emp3.payment_days}")
    except Exception as e:
        print(f"Emp3 failed: {e}")
        import traceback
        traceback.print_exc()

    # Scenario 2: Emp4 (Joined Jan 15)
    emp4_email = "emp4_fixed_30_v4@example.com"
    emp4 = make_employee_custom(emp4_email, date_of_joining="2024-01-15")

    try:
        structure_name = "Monthly Salary Structure Test for Salary Slip"
        # Assignment from joining date
        create_salary_structure_assignment(emp4, structure_name, from_date="2024-01-15", company="_Test Company")
        
        ss_emp4 = frappe.new_doc("Salary Slip")
        ss_emp4.employee = emp4
        ss_emp4.start_date = "2024-01-01"
        ss_emp4.end_date = "2024-01-31"
        ss_emp4.posting_date = "2024-01-31"
        ss_emp4.insert()
        ss_emp4.process_salary_structure()
        ss_emp4.save()
        
        print(f"Emp4 (Joined Jan 15): Payment Days = {ss_emp4.payment_days}")
    except Exception as e:
        print(f"Emp4 failed: {e}")
        import traceback
        traceback.print_exc()

    # Cleanup
    frappe.db.rollback()

if __name__ == "__main__":
    frappe.connect()
    # Ensure fresh execution state
    frappe.local.flags.in_test = True
    try:
        reproduce()
    except Exception as e:
        import traceback
        traceback.print_exc()
