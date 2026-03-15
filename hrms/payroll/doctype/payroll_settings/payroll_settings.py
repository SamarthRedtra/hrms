# Copyright (c) 2020, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt


import frappe
from frappe import _
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.model.document import Document
from frappe.utils import cint, now


class PayrollSettings(Document):
	def validate(self):
		self.validate_password_policy()

		if not self.daily_wages_fraction_for_half_day:
			self.daily_wages_fraction_for_half_day = 0.5

	def validate_password_policy(self):
		if self.email_salary_slip_to_employee and self.encrypt_salary_slips_in_emails:
			if not self.password_policy:
				frappe.throw(_("Password policy for Salary Slips is not set"))

	def on_update(self):
		self.toggle_rounded_total()
		frappe.clear_cache()

	def toggle_rounded_total(self):
		self.disable_rounded_total = cint(self.disable_rounded_total)
		make_property_setter(
			"Salary Slip",
			"rounded_total",
			"hidden",
			self.disable_rounded_total,
			"Check",
			validate_fields_for_doctype=False,
		)
		make_property_setter(
			"Salary Slip",
			"rounded_total",
			"print_hide",
			self.disable_rounded_total,
			"Check",
			validate_fields_for_doctype=False,
		)

	def validate_bulk_component_update_request(self, component_type: str, salary_component: str):
		if not cint(self.enable_bulk_component_update_for_submitted_salary_structures):
			frappe.throw(_("Enable the bulk component update setting in Payroll Settings first."))

		if not component_type:
			frappe.throw(_("Component Type is required."))

		if not salary_component:
			frappe.throw(_("Salary Component To Add is required."))


@frappe.whitelist()
def bulk_add_component_to_submitted_salary_structures(component_type: str, salary_component: str):
	frappe.only_for("System Manager")
	settings = frappe.get_single("Payroll Settings")
	settings.validate_bulk_component_update_request(component_type, salary_component)

	component = get_salary_component_defaults(salary_component)
	if component.type != component_type:
		frappe.throw(
			_("Salary Component {0} is not a {1} component.").format(
				frappe.bold(salary_component), frappe.bold(component_type)
			)
		)

	parentfield = get_parentfield_for_component_type(component_type)
	missing_structures = get_submitted_salary_structures_missing_component(parentfield, salary_component)
	skipped_existing_count = get_submitted_salary_structures_with_component_count(
		parentfield, salary_component
	)
	skipped_cancelled_count = get_cancelled_salary_structures_missing_component_count(
		parentfield, salary_component
	)

	if not missing_structures:
		return {
			"updated_count": 0,
			"skipped_existing_count": skipped_existing_count,
			"skipped_cancelled_count": skipped_cancelled_count,
		}

	timestamp = now()
	fields = [
		"name",
		"creation",
		"modified",
		"modified_by",
		"owner",
		"docstatus",
		"parent",
		"parentfield",
		"parenttype",
		"idx",
		"salary_component",
		"abbr",
		"amount",
		"default_amount",
		"condition",
		"amount_based_on_formula",
		"formula",
		"depends_on_payment_days",
		"is_tax_applicable",
		"is_flexible_benefit",
		"variable_based_on_taxable_salary",
		"statistical_component",
		"exempted_from_income_tax",
		"do_not_include_in_total",
		"do_not_include_in_accounts",
		"deduct_full_tax_on_selected_payroll_date",
		"accrual_component",
	]

	values = []
	for structure in missing_structures:
		values.append(
			(
				frappe.generate_hash(length=10),
				timestamp,
				timestamp,
				frappe.session.user,
				frappe.session.user,
				0,
				structure.name,
				parentfield,
				"Salary Structure",
				(structure.max_idx or 0) + 1,
				salary_component,
				component.salary_component_abbr,
				component.amount or 0,
				component.amount or 0,
				component.condition or "",
				component.amount_based_on_formula or 0,
				component.formula or "",
				component.depends_on_payment_days or 0,
				component.is_tax_applicable or 0,
				component.is_flexible_benefit or 0,
				component.variable_based_on_taxable_salary or 0,
				component.statistical_component or 0,
				component.exempted_from_income_tax or 0,
				component.do_not_include_in_total or 0,
				component.do_not_include_in_accounts or 0,
				component.deduct_full_tax_on_selected_payroll_date or 0,
				component.accrual_component or 0,
			)
		)

	frappe.db.bulk_insert("Salary Detail", fields=fields, values=values)
	touch_salary_structures([structure.name for structure in missing_structures], timestamp)

	return {
		"updated_count": len(values),
		"skipped_existing_count": skipped_existing_count,
		"skipped_cancelled_count": skipped_cancelled_count,
	}


def get_parentfield_for_component_type(component_type: str) -> str:
	parentfields = {
		"Earning": "earnings",
		"Deduction": "deductions",
	}
	try:
		return parentfields[component_type]
	except KeyError:
		frappe.throw(_("Component Type must be either Earning or Deduction."))


def get_salary_component_defaults(salary_component: str):
	component = frappe.db.get_value(
		"Salary Component",
		salary_component,
		[
			"name",
			"type",
			"disabled",
			"salary_component_abbr",
			"amount",
			"condition",
			"amount_based_on_formula",
			"formula",
			"depends_on_payment_days",
			"is_tax_applicable",
			"is_flexible_benefit",
			"variable_based_on_taxable_salary",
			"statistical_component",
			"exempted_from_income_tax",
			"do_not_include_in_total",
			"do_not_include_in_accounts",
			"deduct_full_tax_on_selected_payroll_date",
			"accrual_component",
		],
		as_dict=1,
	)
	if not component:
		frappe.throw(_("Salary Component {0} does not exist.").format(frappe.bold(salary_component)))
	if component.disabled:
		frappe.throw(_("Salary Component {0} is disabled.").format(frappe.bold(salary_component)))
	return component


def get_submitted_salary_structures_missing_component(parentfield: str, salary_component: str):
	# nosemgrep: frappe-semgrep-rules.rules.frappe-using-db-sql
	return frappe.db.sql(
		"""
		SELECT ss.name, COALESCE(MAX(sd.idx), 0) AS max_idx
		FROM `tabSalary Structure` ss
		LEFT JOIN `tabSalary Detail` sd
			ON sd.parent = ss.name
			AND sd.parenttype = 'Salary Structure'
			AND sd.parentfield = %s
		WHERE ss.docstatus = 1
			AND NOT EXISTS (
				SELECT 1
				FROM `tabSalary Detail` existing
				WHERE existing.parent = ss.name
					AND existing.parenttype = 'Salary Structure'
					AND existing.parentfield = %s
					AND existing.salary_component = %s
			)
		GROUP BY ss.name
		""",
		(parentfield, parentfield, salary_component),
		as_dict=1,
	)


def get_submitted_salary_structures_with_component_count(parentfield: str, salary_component: str) -> int:
	# nosemgrep: frappe-semgrep-rules.rules.frappe-using-db-sql
	result = frappe.db.sql(
		"""
		SELECT COUNT(DISTINCT ss.name) AS count
		FROM `tabSalary Structure` ss
		INNER JOIN `tabSalary Detail` sd
			ON sd.parent = ss.name
			AND sd.parenttype = 'Salary Structure'
			AND sd.parentfield = %s
			AND sd.salary_component = %s
		WHERE ss.docstatus = 1
		""",
		(parentfield, salary_component),
		as_dict=1,
	)
	return cint(result[0].count) if result else 0


def get_cancelled_salary_structures_missing_component_count(parentfield: str, salary_component: str) -> int:
	# nosemgrep: frappe-semgrep-rules.rules.frappe-using-db-sql
	result = frappe.db.sql(
		"""
		SELECT COUNT(*) AS count
		FROM `tabSalary Structure` ss
		WHERE ss.docstatus = 2
			AND NOT EXISTS (
				SELECT 1
				FROM `tabSalary Detail` sd
				WHERE sd.parent = ss.name
					AND sd.parenttype = 'Salary Structure'
					AND sd.parentfield = %s
					AND sd.salary_component = %s
			)
		""",
		(parentfield, salary_component),
		as_dict=1,
	)
	return cint(result[0].count) if result else 0


def touch_salary_structures(structure_names: list[str], timestamp: str):
	if not structure_names:
		return

	placeholders = ", ".join(["%s"] * len(structure_names))
	params = [timestamp, frappe.session.user, *structure_names]

	# nosemgrep: frappe-semgrep-rules.rules.frappe-using-db-sql
	frappe.db.sql(
		f"""
		UPDATE `tabSalary Structure`
		SET modified = %s, modified_by = %s
		WHERE name IN ({placeholders})
		""",
		params,
	)
