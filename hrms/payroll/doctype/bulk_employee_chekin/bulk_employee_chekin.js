// Copyright (c) 2025, HRMS Custom and contributors
// For license information, please see license.txt

frappe.ui.form.on("Bulk Employee Chekin", {
    setup(frm) {
        frm.trigger("set_queries");
        if (typeof hrms !== "undefined" && typeof hrms.setup_employee_filter_group === "function") {
            hrms.setup_employee_filter_group(frm);
        }
    },
    onload(frm) {
        console.log("onload");
        const ensure_company = () => {
            try {
                const default_company = frappe?.defaults?.get_default && frappe.defaults.get_default("company");
                if (default_company && !frm.doc.company) {
                    return frm.set_value("company", default_company);
                }
            } catch (e) {
                // no-op if defaults not available
            }
            return Promise.resolve();
        };
        ensure_company().then(() => {
            // render placeholder table immediately, then load data
            frm.events.render_employees_datatable(frm, []);
            frm.trigger("get_employees");
            console.log("onload done");
        });
    },
    onload_post_render(frm) {
        console.log("onload");
        // render placeholder table immediately
        // ensure DOM wrappers exist on single doctypes before rendering
        const field = frm.get_field("employees_html");
        if (field && field.$wrapper) {
            frm.events.render_employees_datatable(frm, []);
            frm.trigger("get_employees");
        }
    },
  refresh(frm) {
        console.log("refresh");
        frm.page.clear_indicator();
        frm.disable_save();
        frm.trigger("set_primary_action");
        frm.trigger("get_employees");
        if (typeof hrms !== "undefined" && typeof hrms.handle_realtime_bulk_action_notification === "function") {
            hrms.handle_realtime_bulk_action_notification(
                frm,
                "completed_bulk_employee_checkin",
                "Employee Checkin",
            );
        }
    },

    company(frm) {
        frm.trigger("get_employees");
    },

    branch(frm) {
        frm.trigger("get_employees");
    },

    department(frm) {
        frm.trigger("get_employees");
    },

    employment_type(frm) {
        frm.trigger("get_employees");
    },

    designation(frm) {
        frm.trigger("get_employees");
    },

    grade(frm) {
        frm.trigger("get_employees");
    },

    time(frm) {
        // time change may enable action button state
    },

    set_primary_action(frm) {
        frm.page.set_primary_action(__("Add Checkin"), () => {
            frm.trigger("open_checkin_dialog");
        });
    },

    set_queries(frm) {
        // shift_type optional
        frm.set_query("company", function () {
            return {};
        });
    },

    get_employees(frm) {
        frm.call({
            method: "get_employees",
            args: {},
            doc: frm.doc,
        }).then((r) => frm.events.render_employees_datatable(frm, r.message));
    },

    render_employees_datatable(frm, employees) {
        frm.checked_rows_indexes = [];
        const columns = frm.events.get_employees_datatable_columns();
        const no_data_message = __("There are no employees based on the given filters.");

        // Ensure sections stay expanded
        frm.set_df_property("quick_filters_section", "collapsible", 0);
        frm.set_df_property("advanced_filters_section", "collapsible", 0);

        const field = frm.get_field("employees_html");
        if (!field || !field.$wrapper) return;

        // Prefer shared renderer if available (consistent behavior across bulk tools)
        if (
            typeof hrms !== "undefined" &&
            typeof hrms.render_employees_datatable === "function" &&
            typeof frappe !== "undefined" &&
            typeof frappe.DataTable === "function"
        ) {
            const get_editor = null;
            const events = {
                onCheckRow() {
                    frm.trigger("update_primary_label");
                },
            };
            hrms.render_employees_datatable(
                frm,
                columns,
                employees,
                no_data_message,
                get_editor,
                events,
            );
            if (frm.employees_datatable) frm.trigger("update_primary_label");
            return;
        }

        if (typeof frappe !== "undefined" && typeof frappe.DataTable === "function" && frm.employees_datatable) {
            frm.employees_datatable.rowmanager.checkMap = [];
            frm.employees_datatable.options.noDataMessage = no_data_message;
            frm.employees_datatable.refresh(employees, columns);
            return;
        }

        const $wrapper = field.$wrapper;
        $wrapper.empty();

        // Fallback renderer when frappe.DataTable is not available: simple HTML table with checkboxes
        if (!(typeof frappe !== "undefined" && typeof frappe.DataTable === "function")) {
            const table = $(
                '<table class="table table-bordered table-hover">\
                    <thead>\
                        <tr>\
                            <th style="width: 36px;"></th>\
                            <th>' + __("Employee") + '</th>\
                            <th>' + __("Name") + '</th>\
                            <th>' + __("Branch") + '</th>\
                            <th>' + __("Department") + '</th>\
                        </tr>\
                    </thead>\
                    <tbody></tbody>\
                </table>'
            ).appendTo($wrapper);

            const $tbody = table.find("tbody");
            if (!employees || !employees.length) {
                const colspan = 5;
                $tbody.append(
                    '<tr><td colspan="' + colspan + '" class="text-muted">' + no_data_message + '</td></tr>'
                );
            } else {
                employees.forEach((row) => {
                    const tr = $(
                        '<tr>\
                            <td><input type="checkbox" class="bec-row-checkbox" data-employee="' + frappe.utils.escape_html(row.employee) + '"></td>\
                            <td>' + frappe.utils.escape_html(row.employee) + '</td>\
                            <td>' + frappe.utils.escape_html(row.employee_name || "") + '</td>\
                            <td>' + frappe.utils.escape_html(row.branch || "") + '</td>\
                            <td>' + frappe.utils.escape_html(row.department || "") + '</td>\
                        </tr>'
                    );
                    $tbody.append(tr);
                });
            }

            if (!frm.bec_fallback_bound) {
                $wrapper.on("change", ".bec-row-checkbox", () => frm.trigger("update_primary_label"));
                frm.bec_fallback_bound = true;
            }
            frm.trigger("update_primary_label");
            return;
        }

        // Default: build DataTable locally if utils renderer not used
        const employee_wrapper = $("<div class=\"employee_wrapper\">").appendTo($wrapper);
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
            events: {
                onCheckRow() {
                    frm.trigger("update_primary_label");
                },
            },
        };
        frm.employees_datatable = new frappe.DataTable(employee_wrapper.get(0), datatable_options);
        frm.trigger("update_primary_label");
    },

    update_primary_label(frm) {
        // count based on available renderer
        let count = 0;
        if (frm.employees_datatable) {
            count = frm.employees_datatable.rowmanager.getCheckedRows().length;
        } else {
            const $wrapper = frm.get_field("employees_html").$wrapper;
            count = $wrapper.find(".bec-row-checkbox:checked").length;
        }
        const base = __("Add Checkin");
        frm.page.set_primary_action(count ? `${base} (${count})` : base, () => {
            frm.trigger("open_checkin_dialog");
        });
    },

    get_employees_datatable_columns() {
        return [
            { name: "employee", id: "employee", content: __("Employee"), editable: false, focusable: false },
            { name: "employee_name", id: "employee_name", content: __("Name"), editable: false, focusable: false },
            { name: "branch", id: "branch", content: __("Branch"), editable: false, focusable: false },
            { name: "department", id: "department", content: __("Department"), editable: false, focusable: false },
        ].map((x) => ({ ...x, dropdown: false, align: "left" }));
    },

    open_checkin_dialog(frm) {
        // gather selected employees first
        const selected_employees = [];
        if (frm.employees_datatable) {
            const rows = frm.employees_datatable.datamanager.data;
            const checked_row_indexes = frm.employees_datatable.rowmanager.getCheckedRows();
            checked_row_indexes.forEach((idx) => {
                selected_employees.push(rows[idx].employee);
            });
        } else {
            const $wrapper = frm.get_field("employees_html").$wrapper;
            $wrapper.find(".bec-row-checkbox:checked").each((_, el) => {
                selected_employees.push(el.getAttribute("data-employee"));
            });
        }

        if (typeof hrms !== "undefined" && typeof hrms.validate_mandatory_fields === "function") {
            hrms.validate_mandatory_fields(frm, selected_employees);
        } else if (!selected_employees.length) {
            frappe.throw({
                message: __("Please select at least one employee to perform this action."),
                title: __("No Employees Selected"),
            });
        }
        const dialog = new frappe.ui.Dialog({
            title: __("Add Checkin for {0} employee(s)", [selected_employees.length]),
            fields: [
                { fieldname: "log_type", fieldtype: "Select", label: __("Log Type"), options: "\nIN\nOUT", reqd: 1 },
                { fieldname: "time", fieldtype: "Datetime", label: __("Time"), default: "Now", reqd: 1 },
                { fieldname: "device_id", fieldtype: "Data", label: __("Location / Device ID") },
                { fieldname: "project", fieldtype: "Link", label: __("Project"), options: "Project" },
                { fieldname: "skip_auto_attendance", fieldtype: "Check", label: __("Skip Auto Attendance") },
            ],
            primary_action_label: __("Create"),
            primary_action(values) {
                dialog.hide();
                frm.call({
                    method: "bulk_create_checkins",
                    doc: frm.doc,
                    args: {
                        employees: selected_employees,
                        log_type: values.log_type,
                        time: values.time,
                        device_id: values.device_id,
                        project: values.project,
                        skip_auto_attendance: values.skip_auto_attendance ? 1 : 0,
                    },
                    freeze: true,
                    freeze_message: __("Creating Checkins"),
                });
            },
        });
        dialog.show();
    },
});


