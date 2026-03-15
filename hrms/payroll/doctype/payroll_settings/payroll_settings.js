// Copyright (c) 2020, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Payroll Settings", {
	refresh(frm) {
		frm.set_query("sender", () => {
			return {
				filters: {
					enable_outgoing: 1,
				},
			};
		});
		set_bulk_component_query(frm);
		toggle_bulk_update_button(frm);
	},

	encrypt_salary_slips_in_emails(frm) {
		const encrypt_state = frm.doc.encrypt_salary_slips_in_emails;
		frm.set_df_property("password_policy", "reqd", encrypt_state);
	},

	enable_bulk_component_update_for_submitted_salary_structures(frm) {
		toggle_bulk_update_button(frm);
	},

	bulk_component_update_type(frm) {
		set_bulk_component_query(frm);
		frm.set_value("bulk_component_to_add", "");
		toggle_bulk_update_button(frm);
	},

	bulk_component_to_add(frm) {
		toggle_bulk_update_button(frm);
	},

	validate(frm) {
		let policy = frm.doc.password_policy;
		if (policy) {
			if (policy.includes(" ") || policy.includes("--")) {
				frappe.msgprint(
					__(
						"Password policy cannot contain spaces or simultaneous hyphens. The format will be restructured automatically",
					),
				);
			}
			frm.set_value(
				"password_policy",
				policy
					.split(new RegExp(" |-", "g"))
					.filter((token) => token)
					.join("-"),
			);
		}
	},
});

function set_bulk_component_query(frm) {
	frm.set_query("bulk_component_to_add", () => {
		const filters = { disabled: 0 };

		if (frm.doc.bulk_component_update_type) {
			filters.type = frm.doc.bulk_component_update_type;
		}

		return { filters };
	});
}

function toggle_bulk_update_button(frm) {
	frm.remove_custom_button(__("Bulk Add Component"));

	if (!frm.doc.enable_bulk_component_update_for_submitted_salary_structures) {
		return;
	}

	frm.add_custom_button(__("Bulk Add Component"), () => run_bulk_component_update(frm));
}

function run_bulk_component_update(frm) {
	if (!frm.doc.bulk_component_update_type || !frm.doc.bulk_component_to_add) {
		frappe.throw(__("Select both Component Type and Salary Component To Add."));
	}

	const componentType = frm.doc.bulk_component_update_type;
	const salaryComponent = frm.doc.bulk_component_to_add;

	frappe.confirm(
		__(
			"This will add {0} to all submitted Salary Structures where it is missing. Continue?",
			[salaryComponent],
		),
		() => {
			frappe.call({
				method:
					"hrms.payroll.doctype.payroll_settings.payroll_settings.bulk_add_component_to_submitted_salary_structures",
				args: {
					component_type: componentType,
					salary_component: salaryComponent,
				},
				freeze: true,
				freeze_message: __("Updating submitted Salary Structures..."),
				callback: ({ message }) => {
					if (!message) {
						return;
					}

					frappe.msgprint(
						__(
							"Updated {0} Salary Structure(s). Skipped {1} already containing the component and {2} cancelled structure(s).",
							[message.updated_count, message.skipped_existing_count, message.skipped_cancelled_count],
						),
					);
				},
			});
		},
	);
}
