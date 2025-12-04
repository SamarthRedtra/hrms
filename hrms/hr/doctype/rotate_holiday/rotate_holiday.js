// Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Rotate Holiday", {
	refresh(frm) {
		// Add any refresh logic here
	},

	date(frm) {
		// Auto-set day when date changes
		if (frm.doc.date) {
			const date = frappe.datetime.str_to_obj(frm.doc.date);
			const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
			frm.set_value("day", days[date.getDay()]);
		}
	},
});

