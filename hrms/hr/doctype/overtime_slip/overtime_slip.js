// Copyright (c) 2024, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Overtime Slip", {
	refresh: async (frm) => {
		await frm.events.sync_holiday_dates(frm);
		frm.events.apply_standard_hours_to_all_rows(frm);

		if (frm.doc.docstatus === 0) {
			frm.add_custom_button(__("Fetch Overtime Details"), () => {
				if (!frm.doc.employee || !frm.doc.posting_date || !frm.doc.company) {
					frappe.msgprint({
						title: __("Missing Fields"),
						message: __(
							"Please fill in Employee, Posting Date, and Company before fetching overtime details.",
						),
						indicator: "orange",
					});
				} else {
					frm.events.get_emp_details_and_overtime_duration(frm);
				}
			});
		}
	},

	employee(frm) {
		frm.events.set_frequency_and_dates(frm);
	},
	posting_date(frm) {
		frm.events.set_frequency_and_dates(frm);
	},
	start_date: async function (frm) {
		await frm.events.sync_holiday_dates(frm);
		frm.events.apply_standard_hours_to_all_rows(frm);
	},
	end_date: async function (frm) {
		await frm.events.sync_holiday_dates(frm);
		frm.events.apply_standard_hours_to_all_rows(frm);
	},
	standard_working_hours(frm) {
		frm.events.apply_standard_hours_to_all_rows(frm);
	},
	overtime_details_add(frm, cdt, cdn) {
		frm.events.apply_standard_hours_to_row(frm, cdt, cdn);
	},
	set_frequency_and_dates: function (frm) {
		if (frm.doc.employee && frm.doc.posting_date) {
			return frappe.call({
				method: "get_frequency_and_dates",
				doc: frm.doc,
				callback: async function () {
					await frm.events.sync_holiday_dates(frm);
					frm.events.apply_standard_hours_to_all_rows(frm);
					frm.refresh();
				},
			});
		}
	},
	sync_holiday_dates: async function (frm) {
		frm._holiday_dates = new Set();
		if (!(frm.doc.employee && frm.doc.start_date && frm.doc.end_date)) {
			return;
		}

		const response = await frappe.call({
			method: "get_holiday_dates",
			doc: frm.doc,
		});
		const holidayDates = Array.isArray(response.message) ? response.message : [];
		frm._holiday_dates = new Set(holidayDates);
	},
	apply_standard_hours_to_all_rows: function (frm) {
		if (!frm.doc.overtime_details?.length) {
			return;
		}

		for (const row of frm.doc.overtime_details) {
			frm.events.apply_standard_hours_to_row(frm, row.doctype, row.name);
		}
		frm.refresh_field("overtime_details");
	},
	apply_standard_hours_to_row: function (frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row) {
			return;
		}

		const parentStdHours = frm.doc.standard_working_hours;
		const hasParentStandardHours =
			parentStdHours !== null && parentStdHours !== undefined && parentStdHours !== "";
		const isHoliday = row.date && frm._holiday_dates?.has(row.date);

		if (isHoliday) {
			frappe.model.set_value(cdt, cdn, "standard_working_hours", 0);
			return;
		}

		if (hasParentStandardHours) {
			frappe.model.set_value(cdt, cdn, "standard_working_hours", parentStdHours);
		}
	},
	get_emp_details_and_overtime_duration: function (frm) {
		if (frm.doc.employee) {
			return frappe.call({
				method: "get_emp_and_overtime_details",
				doc: frm.doc,
				callback: async function () {
					await frm.events.sync_holiday_dates(frm);
					frm.events.apply_standard_hours_to_all_rows(frm);
					frm.refresh();
				},
			});
		}
	},
});

frappe.ui.form.on("Overtime Details", {
	date(frm, cdt, cdn) {
		frm.events.apply_standard_hours_to_row(frm, cdt, cdn);
	},
});
