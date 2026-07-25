frappe.listview_settings["Attendance"] = {
	add_fields: ["status", "attendance_date"],

	get_indicator: function (doc) {
		if (["Present", "Work From Home"].includes(doc.status)) {
			return [__(doc.status), "green", "status,=," + doc.status];
		} else if (["Absent", "On Leave", "Weekly Off"].includes(doc.status)) {
			return [__(doc.status), "red", "status,=," + doc.status];
		} else if (doc.status == "Half Day") {
			return [__(doc.status), "orange", "status,=," + doc.status];
		}
	},

	_as_date_str: function (value) {
		if (!value) {
			return null;
		}
		if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
			return value.slice(0, 10);
		}
		const m = moment(value);
		return m.isValid() ? m.format("YYYY-MM-DD") : null;
	},

	onload: function (list_view) {
		let me = this;

		list_view.page.add_inner_button(__("Mark Attendance"), function () {
			let first_day = moment().startOf("month");
			if (moment().date() === 1) {
				first_day = first_day.subtract(1, "month");
			}

			let dialog = new frappe.ui.Dialog({
				title: __("Mark Attendance"),
				fields: [
					{
						fieldname: "employee",
						label: __("For Employee"),
						fieldtype: "Link",
						options: "Employee",
						get_query: () => {
							return {
								query: "erpnext.controllers.queries.employee_query",
							};
						},
						reqd: 1,
						onchange: () => me.reset_dialog(dialog),
					},
					{
						fieldtype: "Section Break",
						fieldname: "time_period_section",
						hidden: 1,
					},
					{
						label: __("Start"),
						fieldtype: "Date",
						fieldname: "from_date",
						reqd: 1,
						default: first_day.format("YYYY-MM-DD"),
						onchange: () => me.get_unmarked_days(dialog),
					},
					{
						label: __("Status"),
						fieldtype: "Select",
						fieldname: "status",
						options: ["Present", "Absent", "Half Day", "Work From Home"],
						reqd: 1,
					},
					{
						fieldtype: "Column Break",
						fieldname: "time_period_column",
					},
					{
						label: __("End"),
						fieldtype: "Date",
						fieldname: "to_date",
						reqd: 1,
						default: frappe.datetime.get_today(),
						onchange: () => me.get_unmarked_days(dialog),
					},
					{
						label: __("Shift"),
						fieldtype: "Link",
						fieldname: "shift",
						options: "Shift Type",
					},
					{
						label: __("Project"),
						fieldtype: "Link",
						fieldname: "project",
						options: "Project",
					},

					{
						fieldtype: "Section Break",
						fieldname: "days_section",
						hidden: 1,
					},
					{
						label: __("Exclude Holidays"),
						fieldtype: "Check",
						fieldname: "exclude_holidays",
						onchange: () => me.get_unmarked_days(dialog),
					},
					{
						label: __("Unmarked Attendance for days"),
						fieldname: "unmarked_days",
						fieldtype: "MultiCheck",
						options: [],
						columns: 2,
						select_all: true,
					},
				],
				primary_action(data) {
					data.from_date = me._as_date_str(data.from_date);
					data.to_date = me._as_date_str(data.to_date);
					if (Array.isArray(data.unmarked_days)) {
						data.unmarked_days = data.unmarked_days
							.map((d) => me._as_date_str(d))
							.filter(Boolean);
					}

					if (cur_dialog.no_unmarked_days_left) {
						frappe.msgprint(
							__(
								"Attendance from {0} to {1} has already been marked for the Employee {2}",
								[data.from_date, data.to_date, data.employee],
							),
						);
					} else {
						frappe.confirm(
							__("Mark attendance as {0} for {1} on selected dates?", [
								data.status,
								data.employee,
							]),
							() => {
								frappe.call({
									method: "hrms.hr.doctype.attendance.attendance.mark_bulk_attendance",
									args: {
										data: data,
									},
									callback: function (r) {
										if (r.message === 1) {
											frappe.show_alert({
												message: __("Attendance Marked"),
												indicator: "blue",
											});
											cur_dialog.hide();
										}
									},
								});
							},
						);
					}
					dialog.hide();
					list_view.refresh();
				},
				primary_action_label: __("Mark Attendance"),
			});
			dialog.show();
		});
	},

	reset_dialog: function (dialog) {
		let fields = dialog.fields_dict;

		dialog.set_df_property("time_period_section", "hidden", fields.employee.value ? 0 : 1);
		dialog.set_df_property("days_section", "hidden", 1);
		dialog.set_df_property("unmarked_days", "options", []);
		dialog.no_unmarked_days_left = false;
		fields.exclude_holidays.value = false;

		fields.to_date.datepicker.update({
			maxDate: moment().toDate(),
		});

		this.get_unmarked_days(dialog);
	},

	get_unmarked_days: function (dialog) {
		let fields = dialog.fields_dict;
		const from_date = this._as_date_str(fields.from_date.value);
		const to_date = this._as_date_str(fields.to_date.value);

		if (fields.employee.value && from_date && to_date) {
			dialog.set_df_property("days_section", "hidden", 0);
			dialog.set_df_property("status", "hidden", 0);
			dialog.set_df_property("exclude_holidays", "hidden", 0);
			dialog.no_unmarked_days_left = false;

			frappe
				.call({
					method: "hrms.hr.doctype.attendance.attendance.get_unmarked_days",
					args: {
						employee: fields.employee.value,
						from_date: from_date,
						to_date: to_date,
						exclude_holidays: fields.exclude_holidays.value,
					},
				})
				.then((r) => {
					const dates = r.message || [];
					const options = dates
						.map((day) => {
							const value = this._as_date_str(day);
							return {
								label: moment(value, "YYYY-MM-DD").format("DD-MM-YYYY"),
								value: value,
								checked: 1,
							};
						})
						.filter((opt) => opt.value);

					const field = dialog.fields_dict.unmarked_days;
					if (field) {
						field.df.options = options;
						field.refresh();
					} else {
						dialog.set_df_property("unmarked_days", "options", options);
					}
					dialog.no_unmarked_days_left = options.length === 0;

					if (options.length === 0) {
						frappe.show_alert({
							message: __(
								"All days in this range already have Attendance. Mark Attendance only creates missing days — edit/cancel existing records to change them."
							),
							indicator: "orange",
						});
					}
				});
		}
	},
};
