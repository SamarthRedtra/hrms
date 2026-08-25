frappe.provide("hrms");

$.extend(hrms, {
	proceed_save_with_reminders_frequency_change: () => {
		frappe.ui.hide_open_dialog();
		frappe.call({
			method: "hrms.hr.doctype.hr_settings.hr_settings.set_proceed_with_frequency_change",
			callback: () => {
				// nosemgrep: frappe-semgrep-rules.rules.frappe-cur-frm-usage
				cur_frm.save();
			},
		});
	},

	set_payroll_frequency_to_null: (frm) => {
		if (cint(frm.doc.salary_slip_based_on_timesheet)) {
			frm.set_value("payroll_frequency", "");
		}
	},

	get_current_employee: async (frm) => {
		const employee = (
			await frappe.db.get_value("Employee", { user_id: frappe.session.user }, "name")
		)?.message?.name;

		return employee;
	},

	validate_mandatory_fields: (frm, selected_rows, items = "Employees") => {
		const missing_fields = [];
		for (d in frm.fields_dict) {
			if (frm.fields_dict[d].df.reqd && !frm.doc[d] && d !== "__newname")
				missing_fields.push(frm.fields_dict[d].df.label);
		}

		if (missing_fields.length) {
			let message = __("Mandatory fields required for this action:");
			message += "<br><br><ul><li>" + missing_fields.join("</li><li>") + "</ul>";
			frappe.throw({
				message: message,
				title: __("Missing Fields"),
			});
		}

		if (!selected_rows.length)
			frappe.throw({
				message: __("Please select at least one row to perform this action."),
				title: __("No {0} Selected", [__(items)]),
			});
	},

	setup_employee_filter_group: (frm) => {
		const filter_wrapper = frm.fields_dict.filter_list.$wrapper;
		filter_wrapper.empty();

		frappe.model.with_doctype("Employee", () => {
			frm.filter_list = new frappe.ui.FilterGroup({
				parent: filter_wrapper,
				doctype: "Employee",
				on_change: () => {
					frm.advanced_filters = frm.filter_list
						.get_filters()
						.reduce((filters, item) => {
							// item[3] is the value from the array [doctype, fieldname, condition, value]
							if (item[3]) {
								filters.push(item.slice(1, 4));
							}
							return filters;
						}, []);
					frm.trigger("get_employees");
				},
			});
		});
	},

	render_employees_datatable: (
		frm,
		columns,
		employees,
		no_data_message = __("No Data"),
		get_editor = null,
		events = {},
	) => {
		// section automatically collapses on applying a single filter
		frm.set_df_property("quick_filters_section", "collapsible", 0);
		frm.set_df_property("advanced_filters_section", "collapsible", 0);

		if (frm.employees_datatable) {
			frm.employees_datatable.rowmanager.checkMap = [];
			frm.employees_datatable.options.noDataMessage = no_data_message;
			frm.employees_datatable.refresh(employees, columns);
			return;
		}

		const $wrapper = frm.get_field("employees_html").$wrapper;
		const employee_wrapper = $(`<div class="employee_wrapper">`).appendTo($wrapper);
		const datatable_options = {
			columns: columns,
			data: employees,
			checkboxColumn: true,
			checkedRowStatus: false,
			serialNoColumn: false,
			dynamicRowHeight: true,
			inlineFilters: true,
			layout: "fluid",
			cellHeight: 35,
			noDataMessage: no_data_message,
			disableReorderColumn: true,
			getEditor: get_editor,
			events: events,
		};
		frm.employees_datatable = new frappe.DataTable(employee_wrapper.get(0), datatable_options);
	},

	handle_realtime_bulk_action_notification: (frm, event, doctype) => {
		frappe.realtime.off(event);
		frappe.realtime.on(event, (message) => {
			hrms.notify_bulk_action_status(
				doctype,
				message.failure,
				message.success,
				message.for_processing,
			);

			// refresh only on complete/partial success
			if (message.success) frm.refresh();
		});
	},

	notify_bulk_action_status: (doctype, failure, success, for_processing = false) => {
		let action = __("create/submit");
		let action_past = __("created");
		if (for_processing) {
			action = __("process");
			action_past = __("processed");
		}

		let message = "";
		let title = __("Success");
		let indicator = "green";

		if (failure.length) {
			message += __("Failed to {0} {1} for employees:", [action, doctype]);
			message += " " + frappe.utils.comma_and(failure) + "<hr>";
			message += __(
				"Check <a href='/app/List/Error Log?reference_doctype={0}'>{1}</a> for more details",
				[doctype, __("Error Log")],
			);
			title = __("Failure");
			indicator = "red";

			if (success.length) {
				message += "<hr>";
				title = __("Partial Success");
				indicator = "orange";
			}
		}

		if (success.length) {
			message += __("Successfully {0} {1} for the following employees:", [
				action_past,
				doctype,
			]);
			message += __(
				"<table class='table table-bordered'><tr><th>{0}</th><th>{1}</th></tr>",
				[__("Employee"), doctype],
			);
			for (const d of success) {
				message += `<tr><td>${d.employee}</td><td>${d.doc}</td></tr>`;
			}
			message += "</table>";
		}

		frappe.msgprint({
			message,
			title,
			indicator,
			is_minimizable: true,
		});
	},

	fetch_geolocation: async (frm) => {
		if (!navigator.geolocation) {
			frappe.msgprint({
				message: __("Geolocation is not supported by your current browser"),
				title: __("Geolocation Error"),
				indicator: "red",
			});
			hide_field(["geolocation"]);
			return;
		}

		frappe.dom.freeze(__("Fetching your geolocation") + "...");

		navigator.geolocation.getCurrentPosition(
			async (position) => {
				frm.set_value("latitude", position.coords.latitude);
				frm.set_value("longitude", position.coords.longitude);

				await frm.call("set_geolocation");
				frappe.dom.unfreeze();
			},
			(error) => {
				frappe.dom.unfreeze();

				let msg = __("Unable to retrieve your location") + "<br><br>";
				if (error) {
					msg += __("ERROR({0}): {1}", [error.code, error.message]);
				}
				frappe.msgprint({
					message: msg,
					title: __("Geolocation Error"),
					indicator: "red",
				});
			},
		);
	},

	get_doctype_fields_for_autocompletion: (doctype) => {
		const fields = frappe.get_meta(doctype).fields;
		const autocompletions = [];

		fields
			.filter((df) => !frappe.model.no_value_type.includes(df.fieldtype))
			.map((df) => {
				autocompletions.push({
					value: df.fieldname,
					score: 8,
					meta: __("{0} Field", [doctype]),
				});
			});

		return autocompletions;
	},

	add_shift_tools_button_to_list: (list_view, action = "Assign Shift") => {
		list_view.page.add_inner_button(
			__("Shift Assignment Tool"),
			() => {
				const doc = frappe.model.get_new_doc("Shift Assignment Tool");
				doc.action = action;
				doc.company = frappe.defaults.get_default("company");
				doc.status = "Active";
				frappe.set_route("Form", "Shift Assignment Tool", doc.name);
			},
			__("Shift Tools"),
		);

		list_view.page.add_inner_button(
			__("Roster"),
			() => {
				window.location.href = "/hr/roster";
			},
			__("Shift Tools"),
		);
	},

	add_shift_tools_button_to_form: (frm, fields) => {
		frm.add_custom_button(
			__("Shift Assignment Tool"),
			() => {
				const doc = frappe.model.get_new_doc("Shift Assignment Tool");
				Object.assign(doc, fields);
				doc.company = frappe.defaults.get_default("company");
				doc.status = "Active";
				frappe.set_route("Form", "Shift Assignment Tool", doc.name);
			},
			__("Shift Tools"),
		);
		frm.add_custom_button(
			__("Roster"),
			() => {
				window.location.href = "/hr/roster";
			},
			__("Shift Tools"),
		);
	},

	mark_shift_attendance: (frm) => {
		if (!frm.doc.enable_auto_attendance) {
			frm.scroll_to_field("enable_auto_attendance");
			frappe.throw(__("Please Enable Auto Attendance and complete the setup first."));
		}

		if (!frm.doc.process_attendance_after) {
			frm.scroll_to_field("process_attendance_after");
			frappe.throw(__("Please set {0}.", [__("Process Attendance After").bold()]));
		}

		if (!frm.doc.last_sync_of_checkin) {
			frm.scroll_to_field("last_sync_of_checkin");
			frappe.throw(__("Please set {0}.", [__("Last Sync of Checkin").bold()]));
		}

		const dialog = new frappe.ui.Dialog({
			title: __("Mark Attendance"),
			size: "large",
			fields: [
				{
					fieldname: "employee_scope",
					label: __("Process For"),
					fieldtype: "Select",
					options: "All Employees\nSpecific Employees",
					default: "All Employees",
					reqd: 1,
					onchange: () => {
						if (dialog.get_value("employee_scope") === "Specific Employees") {
							load_employees();
						}
					},
				},
				{
					fieldname: "employee_filter",
					label: __("Search Employees"),
					fieldtype: "Data",
					depends_on: "eval:doc.employee_scope=='Specific Employees'",
				},
				{
					fieldname: "employees",
					label: __("Employees"),
					fieldtype: "MultiCheck",
					select_all: true,
					columns: "18rem",
					options: [],
					sort_options: false,
					depends_on: "eval:doc.employee_scope=='Specific Employees'",
				},
			],
			primary_action_label: __("Mark Attendance"),
			primary_action: (values) => {
				const specific = values.employee_scope === "Specific Employees";
				const employees = values.employees || [];
				if (specific && !employees.length) {
					frappe.msgprint(__("Select at least one employee"));
					return;
				}
				dialog.hide();
				frm.call({
					doc: frm.doc,
					method: "process_auto_attendance",
					args: specific ? { employees } : {},
					freeze: true,
					callback: () => {
						frappe.msgprint(__("Attendance has been marked as per employee check-ins"));
					},
				});
			},
		});

		const load_employees = () => {
			const field = dialog.fields_dict.employees;
			if ((field.df.options || []).length) {
				return;
			}
			frm.call({
				method: "get_employees_for_mark_attendance",
				doc: frm.doc,
			}).then((r) => {
				field.df.options = (r.message || []).map((emp) => {
					const name = emp.label || emp.value;
					return {
						label: `${frappe.utils.escape_html(name)} (${frappe.utils.escape_html(emp.value)})`,
						value: emp.value,
						checked: 0,
					};
				});
				field.refresh();
				field.$wrapper.find(".checkbox-options").css({
					maxHeight: "360px",
					overflowY: "auto",
				});
			});
		};

		const filter_checkboxes = (search_text) => {
			const search = (search_text || "").toLowerCase();
			const field = dialog.fields_dict.employees;
			(field.options || []).forEach((opt) => {
				if (!opt.$checkbox) return;
				const hay = `${opt.label} ${opt.value}`.toLowerCase();
				opt.$checkbox.toggle(!search || hay.includes(search));
			});
		};

		dialog.show();
		dialog.fields_dict.employee_filter.$input.on("input", function () {
			filter_checkboxes($(this).val());
		});
	},
});
