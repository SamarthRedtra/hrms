// Copyright (c) 2018, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Shift Type", {
	refresh: function (frm) {
		if (frm.doc.__islocal) return;

		hrms.add_shift_tools_button_to_form(frm, {
			action: "Assign Shift",
			shift_type: frm.doc.name,
		});

		frm.add_custom_button(__("Mark Attendance"), () => {
			hrms.mark_shift_attendance(frm);
		});
	},

	auto_update_last_sync: function (frm) {
		if (frm.doc.auto_update_last_sync) {
			frm.set_value("last_sync_of_checkin", "");
		}
	},
});
