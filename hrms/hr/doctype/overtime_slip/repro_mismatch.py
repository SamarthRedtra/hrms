
import frappe

def run():
    try:
        ot_type_name = "Test OT Type"
        if not frappe.db.exists("Overtime Type", ot_type_name):
            # Need to create one. First check/create Salary Component
            salary_component = "Overtime"
            if not frappe.db.exists("Salary Component", salary_component):
                frappe.get_doc({
                    "doctype": "Salary Component",
                    "salary_component": salary_component,
                    "type": "Earning"
                }).insert(ignore_if_duplicate=True)
                print(f"Created Salary Component: {salary_component}")
            
            try:
                ot_type = frappe.get_doc({
                    "doctype": "Overtime Type",
                    "name": ot_type_name,
                    "overtime_calculation_method": "Fixed Hourly Rate",
                    "hourly_rate": 100,
                    "standard_multiplier": 1.5,
                    "weekend_multiplier": 2.0,
                    "public_holiday_multiplier": 2.0,
                    "applicable_for_weekend": 1,
                    "applicable_for_public_holiday": 1,
                    "overtime_salary_component": salary_component
                }).insert(ignore_if_duplicate=True)
                frappe.db.commit()
                print(f"Created Test OT Type: {ot_type_name}")
            except Exception:
                pass
        else:
             print(f"Using existing OT Type: {ot_type_name}")

        # Get an existing employee or create one
        employee_name = frappe.db.get_value("Employee", {"status": "Active"})
        if not employee_name:
             # Create Employee
            employee = frappe.get_doc({
                "doctype": "Employee",
                "first_name": "Test OT Employee",
                "company": frappe.db.get_value("Company", filters={"is_group": 0}),
                "status": "Active",
                "date_of_joining": "2024-01-01"
            }).insert(ignore_if_duplicate=True)
            frappe.db.commit()
            employee_name = employee.name
            print(f"Created Employee: {employee_name}")

        company = frappe.db.get_value("Employee", employee_name, "company")
        
        print(f"Using Employee: {employee_name}, OT Type: {ot_type_name}")

        # Cleanup existing Overtime Slips for this period to avoid overlap
        existing_slips = frappe.get_all("Overtime Slip", filters={
            "employee": employee_name,
            "start_date": "2024-01-01",
            "end_date": "2024-01-31"
        })
        for slip in existing_slips:
            try:
                doc = frappe.get_doc("Overtime Slip", slip.name)
                # Cleanup linked Additional Salary
                linked_ads = frappe.get_all("Additional Salary", filters={"ref_doctype": "Overtime Slip", "ref_docname": slip.name})
                for ads in linked_ads:
                    try:
                        doc_ads = frappe.get_doc("Additional Salary", ads.name)
                        if doc_ads.docstatus == 1:
                            doc_ads.cancel()
                        frappe.delete_doc("Additional Salary", ads.name)
                    except Exception as e:
                        print(f"Failed to cleanup linked ADS {ads.name}: {e}")

                if doc.docstatus == 1:
                    doc.cancel()
                doc.delete()
                print(f"Deleted existing slip: {slip.name}")
            except Exception as e:
                print(f"Failed to delete existing slip {slip.name}: {e}")
        
        # Also clean up any loose Additional Salary for this employee and period to allow new submission
        loose_ads = frappe.get_all("Additional Salary", filters={
            "employee": employee_name,
            "payroll_date": "2024-01-31",
            "salary_component": "Overtime",
            "docstatus": ["<", 2]
        })
        for ads in loose_ads:
            try:
                doc_ads = frappe.get_doc("Additional Salary", ads.name)
                if doc_ads.docstatus == 1:
                     doc_ads.cancel()
                frappe.delete_doc("Additional Salary", ads.name)
            except Exception as e:
                print(f"Failed to cleanup loose ADS {ads.name}: {e}")

        frappe.db.commit()

        # Create Overtime Slip
        ot_slip = frappe.get_doc({
            "doctype": "Overtime Slip",
            "employee": employee_name,
            "posting_date": "2024-01-31",
            "company": company,
            "start_date": "2024-01-01",
            "end_date": "2024-01-31",
            "overtime_details": [
                {
                    "date": "2024-01-02",
                    "overtime_type": ot_type_name,
                    "overtime_duration": 2.0,
                    "standard_working_hours": 8
                }
            ],
            "total_overtime_duration": 2.0 
        })
        
        ot_slip.insert()
        frappe.db.commit()
        print(f"Created Overtime Slip: {ot_slip.name}")
        
        # Simulate user editing the row
        doc = frappe.get_doc("Overtime Slip", ot_slip.name)
        doc.overtime_details[0].overtime_duration = 3.0
        doc.save()
        frappe.db.commit()
        
        doc.reload()
        print(f"After Edit & Save - Total Duration (DB): {doc.total_overtime_duration}")
        print(f"After Edit & Save - Row Duration (DB): {doc.overtime_details[0].overtime_duration}")
        
        # Submit
        doc.submit()
        frappe.db.commit()
        
        doc.reload()
        
        normal = doc.normal_ot_hours or 0
        holiday = doc.holiday_ot_hours or 0
        total_breakdown = normal + holiday
        
        print(f"Submitted - Normal OT: {normal}")
        print(f"Submitted - Holiday OT: {holiday}")
        print(f"Submitted - Breakdown Sum: {total_breakdown}")
        print(f"Submitted - Total Duration Field: {doc.total_overtime_duration}")
        
        if doc.total_overtime_duration != total_breakdown:
            print("MISMATCH CONFIRMED!")
        else:
            print("No mismatch.")
            
    except Exception as e:
        print(f"Error: {e}")
        # frappe.log_error(frappe.get_traceback()) 

run()
