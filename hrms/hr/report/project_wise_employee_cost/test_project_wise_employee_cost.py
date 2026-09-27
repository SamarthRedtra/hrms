from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from hrms.hr.report.project_wise_employee_cost.project_wise_employee_cost import get_data


class TestProjectWiseEmployeeCost(FrappeTestCase):
	@patch("hrms.hr.report.project_wise_employee_cost.project_wise_employee_cost.frappe.get_all")
	@patch("hrms.hr.report.project_wise_employee_cost.project_wise_employee_cost.get_monthly_project_work_data")
	def test_aggregates_employee_rows_by_project(self, mock_monthly_data, mock_get_all):
		mock_monthly_data.return_value = [
			{
				"employee": "EMP-001",
				"project": "PROJ-001",
				"total_hours": 40,
				"actual_hours": 36,
				"overtime_hours": 4,
				"cost": 1000,
				"overtime_cost": 100,
			},
			{
				"employee": "EMP-002",
				"project": "PROJ-001",
				"total_hours": 20,
				"actual_hours": 18,
				"overtime_hours": 2,
				"cost": 600,
				"overtime_cost": 50,
			},
			{
				"employee": "EMP-003",
				"project": "PROJ-002",
				"total_hours": 10,
				"actual_hours": 10,
				"overtime_hours": 0,
				"cost": 300,
				"overtime_cost": 0,
			},
			{"employee": "EMP-004", "project": None, "cost": 500},
		]
		mock_get_all.return_value = [
			frappe._dict({"name": "PROJ-001", "project_name": "Project One"}),
			frappe._dict({"name": "PROJ-002", "project_name": "Project Two"}),
		]

		data = get_data({"company": "Test Company", "from_date": "2026-09-01", "to_date": "2026-09-30"})

		self.assertEqual(len(data), 2)
		first = data[0]
		self.assertEqual(first["project"], "PROJ-001")
		self.assertEqual(first["employee_count"], 2)
		self.assertEqual(first["total_hours"], 60)
		self.assertEqual(first["actual_hours"], 54)
		self.assertEqual(first["overtime_hours"], 6)
		self.assertEqual(first["allocated_salary_cost"], 1600)
		self.assertEqual(first["overtime_cost"], 150)
