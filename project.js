// Copyright (c) 2024, Construction Management
// License: MIT
// Modern BOQ Progressive Billing Dashboard with Revenue & Cost Tracking

// Load BOQ Management Table module
frappe.provide('boq_management');

frappe.ui.form.on('Project', {
	refresh(frm) {
		if (frm.doc.enable_progressive_boq) {
			render_construction_dashboard(frm);

			// Set up a mutation observer to watch for dashboard changes
			setup_dashboard_protection();

			if (frm.doc.site_location) {
				add_site_stock_button(frm);
			}
		}
	},

	enable_progressive_boq(frm) {
		if (frm.doc.enable_progressive_boq) {
			render_construction_dashboard(frm);
			setup_dashboard_protection();
		} else {
			const wrapper = frm.fields_dict.construction_dashboard?.$wrapper;
			if (wrapper) wrapper.html('');
		}
	}
});

// Set up protection to prevent dashboard from disappearing
function setup_dashboard_protection() {
	// Watch for modal-open class changes
	const observer = new MutationObserver((mutations) => {
		mutations.forEach((mutation) => {
			if (mutation.attributeName === 'class') {
				const body = document.body;
				if (body.classList.contains('modal-open')) {
					// Modal just opened, ensure dashboard stays visible
					ensure_dashboard_visible();
				}
			}
		});
	});

	// Start observing body class changes
	observer.observe(document.body, {
		attributes: true,
		attributeFilter: ['class']
	});

	// Store observer reference to disconnect later if needed
	window._dashboard_observer = observer;
}

function add_site_stock_button(frm) {
	if (!frm.custom_site_stock_btn_added) {
		frm.add_custom_button(__('Site Stock'), () => show_site_stock_dialog(frm), __('Construction'));
		frm.custom_site_stock_btn_added = true;
	}
}

function show_site_stock_dialog(frm) {
	frappe.call({
		method: 'construction_management.api.dpr_utils.get_site_location_stock',
		args: { project: frm.doc.name },
		callback: function (r) {
			const data = r.message || [];
			const dialog = new frappe.ui.Dialog({
				title: __('Site Stock - {0}', [frm.doc.site_location || 'Warehouse']),
				size: 'large',
				primary_action_label: __('Close'),
				primary_action: () => dialog.hide()
			});

			if (!data.length) {
				dialog.set_message(__('No stock found for this site.'));
				dialog.show();
				return;
			}

			const rows = data.map(d => `
				<tr>
					<td>${frappe.utils.escape_html(d.item_code || '')}</td>
					<td>${frappe.utils.escape_html(d.item_name || '')}</td>
					<td class="text-right">${frappe.format(d.actual_qty || 0, { fieldtype: 'Float', precision: 2 })}</td>
					<td class="text-right">${frappe.format(d.reserved_qty || 0, { fieldtype: 'Float', precision: 2 })}</td>
					<td class="text-right">${frappe.format(d.projected_qty || 0, { fieldtype: 'Float', precision: 2 })}</td>
					<td class="text-right">${frappe.format(d.valuation_rate || 0, { fieldtype: 'Currency' })}</td>
					<td>${frappe.utils.escape_html(d.stock_uom || '')}</td>
				</tr>
			`).join('');

			dialog.$body.html(`
				<style>
					.site-stock-table { width: 100%; border-collapse: collapse; }
					.site-stock-table th, .site-stock-table td { padding: 6px 8px; border-bottom: 1px solid #e5e5e5; }
					.site-stock-table th { background: #f7f7f7; text-transform: uppercase; font-size: 10px; color: #6c7680; }
					.site-stock-table td.text-right { text-align: right; }
				</style>
				<table class="site-stock-table">
					<thead>
						<tr>
							<th>${__('Item Code')}</th>
							<th>${__('Item Name')}</th>
							<th class="text-right">${__('On Hand')}</th>
							<th class="text-right">${__('Reserved')}</th>
							<th class="text-right">${__('Projected')}</th>
							<th class="text-right">${__('Valuation')}</th>
							<th>${__('UOM')}</th>
						</tr>
					</thead>
					<tbody>${rows}</tbody>
				</table>
			`);

			dialog.show();
		}
	});
}

function render_construction_dashboard(frm) {
	const wrapper = frm.fields_dict.construction_dashboard?.$wrapper;
	if (!wrapper) return;

	wrapper.html(`
		<div class="boq-dashboard-loading">
			<div class="loading-spinner"></div>
			<p>Loading BOQ Dashboard...</p>
		</div>
		${get_dashboard_styles()}
	`);

	frappe.call({
		method: 'construction_management.api.boq_tree.get_boq_tree_data',
		args: { project: frm.doc.name },
		callback: function (r) {
			if (r.message && r.message.has_boq) {
				// BOQ exists - show dashboard even if no bills yet
				render_modern_dashboard(wrapper, frm, r.message);
			} else {
				render_empty_state(wrapper, frm);
			}
		},
		error: function () {
			render_empty_state(wrapper, frm);
		}
	});
}

function get_dashboard_styles() {
	return `<style>
		/* Ensure dashboard container doesn't collapse and stays visible */
		.frappe-control[data-fieldname="construction_dashboard"] { 
			min-height: 100px !important; 
			position: relative !important; 
			z-index: 1 !important;
			display: block !important;
		}
		.frappe-control[data-fieldname="construction_dashboard"] .like-disabled-input { display: none !important; }
		.frappe-control[data-fieldname="construction_dashboard"] .control-value { 
			display: block !important; 
			visibility: visible !important; 
			opacity: 1 !important;
			height: auto !important;
			overflow: visible !important;
		}
		.boq-dashboard-modern { 
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
			min-height: 200px !important; 
			display: block !important; 
			visibility: visible !important;
			position: relative !important;
			z-index: 1 !important;
		}
		/* Prevent modal from affecting form content */
		body.modal-open .frappe-control[data-fieldname="construction_dashboard"] {
			display: block !important;
			visibility: visible !important;
		}
		body.modal-open .boq-dashboard-modern {
			display: block !important;
			visibility: visible !important;
		}
		.boq-dashboard-loading { text-align: center; padding: 60px 20px; color: #6c757d; }
		.loading-spinner { width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid #5e64ff; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 15px; }
		@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
		/* Fix date picker z-index in modals */
		.flatpickr-calendar { z-index: 2100 !important; }
		.datepicker { z-index: 2100 !important; }
		.modal .datepicker-container { z-index: 2100 !important; }
	</style>`;
}

// Helper function to cleanup modal and restore dashboard visibility
function cleanup_modal_and_restore_dashboard() {
	// Remove any lingering modal backdrops
	$('.modal-backdrop').remove();
	// Restore body scroll
	$('body').removeClass('modal-open').css('overflow', '');

	// Restore dashboard HTML and visibility
	const wrapper = $('.frappe-control[data-fieldname="construction_dashboard"]');
	const controlValue = wrapper.find('.control-value');

	// Restore HTML if it's empty but we have a backup
	if (window._dashboard_html_backup && (!controlValue.html() || controlValue.html().trim() === '')) {
		controlValue.html(window._dashboard_html_backup);
	}

	// Ensure dashboard stays visible
	wrapper.css({
		'display': 'block',
		'visibility': 'visible',
		'opacity': '1'
	});
	controlValue.css({
		'display': 'block',
		'visibility': 'visible'
	});
	$('.boq-dashboard-modern').css({
		'display': 'block',
		'visibility': 'visible'
	});
}

// Lightweight backdrop cleanup used by dialogs
function cleanup_modal_backdrop() {
	$('.modal-backdrop').remove();
	$('body').removeClass('modal-open');
	frappe.dom.unfreeze && frappe.dom.unfreeze();
}

// Helper function to ensure dashboard stays visible when modal opens
function ensure_dashboard_visible() {
	// Store the current dashboard HTML if not already stored
	const wrapper = $('.frappe-control[data-fieldname="construction_dashboard"] .control-value');
	if (wrapper.length && wrapper.html() && wrapper.html().trim()) {
		if (!window._dashboard_html_backup) {
			window._dashboard_html_backup = wrapper.html();
		}
	}

	setTimeout(() => {
		const wrapper = $('.frappe-control[data-fieldname="construction_dashboard"]');
		const controlValue = wrapper.find('.control-value');

		// Restore HTML if it's empty but we have a backup
		if (window._dashboard_html_backup && (!controlValue.html() || controlValue.html().trim() === '')) {
			controlValue.html(window._dashboard_html_backup);
		}

		// Force visibility
		wrapper.css({
			'display': 'block',
			'visibility': 'visible',
			'opacity': '1',
			'position': 'relative',
			'z-index': '1'
		});
		controlValue.css({
			'display': 'block',
			'visibility': 'visible',
			'height': 'auto',
			'overflow': 'visible'
		});
		$('.boq-dashboard-modern').css({
			'display': 'block',
			'visibility': 'visible',
			'position': 'relative',
			'z-index': '1'
		});
	}, 50);
}

function render_empty_state(wrapper, frm) {
	wrapper.html(`
		${get_dashboard_styles()}
		${get_modern_styles()}
		<div class="boq-empty-state">
			<div class="empty-icon">
				<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
					<polyline points="14 2 14 8 20 8"></polyline>
					<line x1="16" y1="13" x2="8" y2="13"></line>
					<line x1="16" y1="17" x2="8" y2="17"></line>
				</svg>
			</div>
			<h3>No BOQ Found</h3>
			<p>Create a Project BOQ to start tracking progressive billing for this project.</p>
			<div class="empty-actions" style="display: flex; gap: 12px; justify-content: center; margin-top: 20px;">
				<button class="btn-modern btn-primary-modern" onclick="create_project_boq('${frm.doc.name}')">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="12" y1="5" x2="12" y2="19"></line>
						<line x1="5" y1="12" x2="19" y2="12"></line>
					</svg>
					Create Project BOQ
				</button>
				<button class="btn-modern btn-outline" onclick="upload_boq_template('${frm.doc.name}')" style="background: white;">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
						<polyline points="17 8 12 3 7 8"></polyline>
						<line x1="12" y1="3" x2="12" y2="15"></line>
					</svg>
					Import from Excel
				</button>
			</div>
		</div>
	`);
}

function render_modern_dashboard(wrapper, frm, data) {
	const kpi = data.kpi || {};
	const progress = kpi.total_boq_value > 0 ? ((kpi.total_billed / kpi.total_boq_value) * 100).toFixed(1) : 0;
	const collectionRate = kpi.total_billed > 0 ? ((kpi.total_collected / kpi.total_billed) * 100).toFixed(1) : 0;

	wrapper.html(`
		${get_dashboard_styles()}
		${get_modern_styles()}
		<div class="boq-dashboard-modern">
			<div class="dashboard-header">
				<div class="header-left">
					<h2 class="dashboard-title">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
							<polyline points="14 2 14 8 20 8"></polyline>
						</svg>
						Bill of Quantities
					</h2>
					<span class="boq-status-badge status-${(data.project_boq?.status || 'Draft').toLowerCase()}">${data.project_boq?.status || 'Draft'}</span>
				</div>
				<div class="header-actions">
					<button class="btn-modern btn-outline" onclick="window.open('/app/project-boq/${data.project_boq?.name}', '_blank')">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
						Open BOQ
					</button>
					<button class="btn-modern btn-outline" onclick="cur_frm.reload_doc()">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
						Refresh
					</button>
				</div>
			</div>
			
			<div class="kpi-grid" id="kpi-grid"></div>
			<div class="action-bar" id="action-bar"></div>
			<div class="bills-container" id="bills-container"></div>
		</div>
	`);

	render_kpi_grid(wrapper.find('#kpi-grid'), kpi, progress, collectionRate);
	render_action_bar(wrapper.find('#action-bar'), frm);
	render_boq_management_table(wrapper.find('#bills-container'), frm, data.bills);

	// Store the dashboard HTML for restoration if needed
	setTimeout(() => {
		const dashboardHtml = wrapper.html();
		if (dashboardHtml && dashboardHtml.trim()) {
			window._dashboard_html_backup = dashboardHtml;
		}
	}, 100);
}

function render_kpi_grid(container, kpi, progress, collectionRate) {
	const totalCost = (kpi.total_labour_cost || 0) + (kpi.total_material_cost || 0) + (kpi.total_asset_cost || 0) + (kpi.total_subcontract_cost || 0) + (kpi.total_expense_cost || 0);
	const margin = (kpi.total_billed || 0) - totalCost;
	const advanceCollected = kpi.advance_collected || 0;
	const invoiceCollected = kpi.invoice_collected || 0;

	container.html(`
		<div class="kpi-card kpi-primary">
			<div class="kpi-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg></div>
			<div class="kpi-content">
				<span class="kpi-label">Total BOQ Value</span>
				<span class="kpi-value">${format_currency(kpi.total_boq_value || 0)}</span>
			</div>
		</div>
		<div class="kpi-card kpi-info">
			<div class="kpi-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></div>
			<div class="kpi-content">
				<span class="kpi-label">Total Revenue</span>
				<span class="kpi-value">${format_currency(kpi.total_billed || 0)}</span>
				<div class="kpi-progress"><div class="kpi-progress-bar" style="width: ${progress}%"></div></div>
				<span class="kpi-sub">${progress}% of BOQ</span>
			</div>
		</div>
		<div class="kpi-card kpi-success">
			<div class="kpi-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div>
			<div class="kpi-content">
				<span class="kpi-label">Collected</span>
				<span class="kpi-value">${format_currency(kpi.total_collected || 0)}</span>
				<div class="kpi-progress"><div class="kpi-progress-bar" style="width: ${collectionRate}%"></div></div>
				<span class="kpi-sub kpi-breakdown">
					<span class="breakdown-item advance">Adv: ${format_currency(advanceCollected)}</span>
					<span class="breakdown-divider">|</span>
					<span class="breakdown-item invoice">Inv: ${format_currency(invoiceCollected)}</span>
				</span>
			</div>
		</div>
		<div class="kpi-card kpi-warning">
			<div class="kpi-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></div>
			<div class="kpi-content">
				<span class="kpi-label">Total Expenses</span>
				<span class="kpi-value">${format_currency(totalCost)}</span>
				<span class="kpi-sub">Margin: ${format_currency(margin)}</span>
			</div>
		</div>
	`);
}

function render_action_bar(container, frm) {
	// Check user permissions
	const user_roles = frappe.user_roles || [];
	const can_create_invoice = user_roles.includes('Project Manager') ||
		user_roles.includes('Quantity Surveyor') ||
		user_roles.includes('System Manager');
	const can_modify_boq = user_roles.includes('Project Manager') ||
		user_roles.includes('Quantity Surveyor') ||
		user_roles.includes('System Manager');
	const can_create_dpr = user_roles.includes('Project Manager') ||
		user_roles.includes('Quantity Surveyor') ||
		user_roles.includes('Site Engineer') ||
		user_roles.includes('Projects User') ||
		user_roles.includes('System Manager');

	container.html(`
		<div class="action-bar-left">
			<button class="btn-modern btn-fullscreen-icon" onclick="openFullScreenBOQ('${frm.doc.name}'); event.stopPropagation(); event.preventDefault();" title="Full Screen View">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
				</svg>
			</button>
			${can_modify_boq ? `
			<button class="btn-modern btn-primary-modern" onclick="add_bill_number('${frm.doc.name}')">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
				Add Bill
			</button>
			` : ''}
			${can_create_invoice ? `
			<button class="btn-modern btn-success-modern" onclick="generate_invoice_for_all('${frm.doc.name}')">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
				Generate Proforma
			</button>
			` : ''}
			${can_create_dpr ? `
			<button class="btn-modern btn-warning-modern" onclick="create_dpr_quick('${frm.doc.name}')">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
				Add DPR
			</button>
			` : ''}
			<button class="btn-modern btn-info-modern" onclick="view_all_dprs('${frm.doc.name}')">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
				View DPRs
			</button>
			<button class="btn-modern btn-outline" style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: white; border: none;" onclick="view_gantt_chart('${frm.doc.name}')">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="4" rx="1"></rect><rect x="3" y="9" width="12" height="4" rx="1"></rect><rect x="3" y="15" width="16" height="4" rx="1"></rect></svg>
				View Gantt Chart
			</button>
			<button class="btn-modern btn-outline" onclick="open_resource_planner('${frm.doc.name}')">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
				Resources
			</button>
			${can_modify_boq ? `
			<button class="btn-modern btn-outline" onclick="record_advance_payment('${frm.doc.name}')">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
				Record Advance
			</button>
			` : ''}
			<button class="btn-modern btn-outline" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none;" onclick="view_payment_certificates('${frm.doc.name}')">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
				Payment Certificates
			</button>
		</div>
		<div class="action-bar-right">
			<button class="btn-modern btn-outline" onclick="print_invoice_till_date('${frm.doc.name}')">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
				Print Till Date
			</button>
			<button class="btn-modern btn-outline" onclick="print_monthly_invoice('${frm.doc.name}')">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
				Monthly Invoice
			</button>
			<button class="btn-modern btn-outline" onclick="export_boq_excel('${frm.doc.name}')">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
				Export Excel
			</button>
			${can_modify_boq ? `
			<button class="btn-modern btn-outline" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; border: none;" onclick="upload_boq_template('${frm.doc.name}')">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
				Upload Template
			</button>
			` : ''}
		</div>
	`);
}

function render_bills_accordion(container, frm, bills) {
	if (!bills || bills.length === 0) {
		container.html('<div class="no-bills-message">No bills found. Click "Add Bill" to get started.</div>');
		return;
	}

	let html = '<div class="bills-accordion">';
	bills.forEach((bill, idx) => {
		const totals = bill.totals || {};
		const qty = totals.qty || {};
		const amount = totals.amount || {};
		const isExpanded = idx === 0;
		const advanceAmount = bill.advance_amount || 0;

		html += `
			<div class="bill-card ${isExpanded ? 'expanded' : ''}" data-bill="${bill.name}">
				<div class="bill-header" onclick="toggleBill(this, event)">
					<div class="bill-header-left">
						<svg class="chevron-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
						<div class="bill-info">
							<span class="bill-title">${bill.bill_no}</span>
							${bill.description ? `<span class="bill-desc">${bill.description}</span>` : ''}
						</div>
					</div>
					<div class="bill-header-right">
						<div class="bill-stat"><span class="stat-label">Items</span><span class="stat-value">${(bill.items || []).length}</span></div>
						<div class="bill-stat"><span class="stat-label">Total</span><span class="stat-value">${format_currency(amount.total)}</span></div>
						<div class="bill-stat"><span class="stat-label">Revenue</span><span class="stat-value">${format_currency(amount.to_date)}</span></div>
						${advanceAmount > 0 ? `<div class="bill-stat advance-stat"><span class="stat-label">Advance</span><span class="stat-value advance-value">${format_currency(advanceAmount)}</span></div>` : ''}
						<div class="bill-stat"><span class="stat-label">Balance</span><span class="stat-value balance-value">${format_currency(amount.balance)}</span></div>
					</div>
				</div>
				<div class="bill-content" style="${isExpanded ? '' : 'display: none;'}">
					<div class="bill-toolbar">
						<button class="btn-modern btn-sm btn-outline" onclick="add_boq_item('${bill.name}', '${frm.doc.name}'); event.stopPropagation();">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
							Add Item
						</button>
						<button class="btn-modern btn-sm btn-outline" onclick="view_bill_advances('${bill.name}'); event.stopPropagation();" title="View Advances">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
							Advances
						</button>
					</div>
					<div class="items-table-wrapper">
						${render_items_table(bill.items || [], frm)}
					</div>
				</div>
			</div>
		`;
	});
	html += '</div>';
	container.html(html);
	attach_item_events(container, frm);
}

function render_items_table(items, frm) {
	if (!items || items.length === 0) {
		return '<div class="no-items-message">No items in this bill. Click "Add Item" to add BOQ items.</div>';
	}

	let html = `
		<table class="items-table">
			<thead>
				<tr>
					<th rowspan="2" class="col-desc">Description</th>
					<th rowspan="2" class="col-unit">Unit</th>
					<th rowspan="2" class="col-num">Qty</th>
					<th rowspan="2" class="col-num">Rate</th>
					<th rowspan="2" class="col-num">Amount</th>
					<th colspan="2" class="col-group col-highlight-blue">Current Billing</th>
					<th colspan="3" class="col-group col-highlight-green">Revenue</th>
					<th rowspan="2" class="col-num">Balance</th>
					<th rowspan="2" class="col-status">Status</th>
					<th rowspan="2" class="col-actions">Actions</th>
				</tr>
				<tr>
					<th class="col-num col-highlight-blue">Qty</th>
					<th class="col-num col-highlight-blue">Value</th>
					<th class="col-num col-highlight-green">Prev</th>
					<th class="col-num col-highlight-green">Curr</th>
					<th class="col-num col-highlight-green">Accum</th>
				</tr>
			</thead>
			<tbody>
	`;

	items.forEach(item => {
		const qty = item.qty || {};
		const amount = item.amount || {};
		const statusClass = get_status_class(item.billing_status);
		const isFullyBilled = item.billing_status === 'Fully Billed';

		html += `
			<tr class="item-row ${isFullyBilled ? 'fully-billed' : ''}" data-item="${item.name}">
				<td class="col-desc">
					<div class="item-desc-wrapper">
						${item.item_code ? `<code class="item-code">${item.item_code}</code>` : ''}
						<span class="item-desc">${item.description || 'No description'}</span>
					</div>
				</td>
				<td class="col-unit">${item.unit || '-'}</td>
				<td class="col-num">${format_number(qty.total)}</td>
				<td class="col-num">${format_currency(amount.rate)}</td>
				<td class="col-num">${format_currency(amount.total)}</td>
				<td class="col-num col-highlight-blue">
					<input type="number" class="current-qty-input" value="${qty.current || 0}" 
						data-item="${item.name}" data-max="${qty.balance + (qty.current || 0)}" data-rate="${amount.rate || 0}"
						data-prev-amount="${amount.prev || 0}"
						step="0.001" min="0" ${isFullyBilled ? 'disabled' : ''}>
				</td>
				<td class="col-num col-highlight-blue">
					<input type="number" class="current-value-input" value="${amount.current || 0}" 
						data-item="${item.name}" data-max="${amount.balance + (amount.current || 0)}" data-rate="${amount.rate || 0}"
						data-prev-amount="${amount.prev || 0}" data-total-amount="${amount.total || 0}"
						step="0.01" min="0" ${isFullyBilled ? 'disabled' : ''}>
				</td>
				<td class="col-num col-highlight-green">${format_currency(amount.prev)}</td>
				<td class="col-num col-highlight-green curr-amount-cell" data-item="${item.name}">${format_currency(amount.current)}</td>
				<td class="col-num col-highlight-green font-bold accum-amount-cell" data-item="${item.name}">${format_currency(amount.to_date)}</td>
				<td class="col-num balance-cell" data-item="${item.name}">${format_currency(amount.balance)}</td>
				<td class="col-status"><span class="status-pill ${statusClass}">${item.billing_status || 'Not Billed'}</span></td>
				<td class="col-actions">
					<div class="action-icons">
						<button class="action-icon-btn action-invoice" onclick="create_item_invoice('${item.name}')" title="Create Invoice" ${isFullyBilled ? 'disabled' : ''}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
						</button>
						<button class="action-icon-btn action-history" onclick="view_item_invoices('${item.name}')" title="View Invoice History">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
						</button>
						<button class="action-icon-btn action-tasks" onclick="view_boq_tasks('${item.name}')" title="View Tasks">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
						</button>
						<button class="action-icon-btn action-cost" onclick="view_cost_details('${item.name}')" title="View Cost Details">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
						</button>
						<button class="action-icon-btn action-edit" onclick="edit_boq_item('${item.name}')" title="Edit Item">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
						</button>
					</div>
				</td>
			</tr>
		`;
	});

	html += '</tbody></table>';
	return html;
}

function attach_item_events(container, frm) {
	// Handle Qty input change - auto-calculate Value
	container.find('.current-qty-input').on('change input', function () {
		const input = $(this);
		const itemName = input.data('item');
		const maxQty = parseFloat(input.data('max')) || 0;
		const rate = parseFloat(input.data('rate')) || 0;
		const prevAmount = parseFloat(input.data('prev-amount')) || 0;
		let newQty = parseFloat(input.val()) || 0;

		if (newQty < 0) { newQty = 0; input.val(0); }
		if (newQty > maxQty) {
			frappe.show_alert({ message: __('Quantity cannot exceed balance ({0})', [maxQty]), indicator: 'orange' });
			newQty = maxQty;
			input.val(maxQty);
		}

		// Auto-update value input
		const row = input.closest('tr');
		const valueInput = row.find('.current-value-input');
		const newValue = newQty * rate;
		valueInput.val(newValue.toFixed(2));

		// Update display cells in real-time
		const totalAmount = parseFloat(valueInput.data('total-amount')) || 0;
		const accumAmount = prevAmount + newValue;
		const balanceAmount = totalAmount - accumAmount;

		row.find('.curr-amount-cell').text(format_currency(newValue));
		row.find('.accum-amount-cell').text(format_currency(accumAmount));
		row.find('.balance-cell').text(format_currency(balanceAmount));

		// Debounce the server update
		clearTimeout(input.data('timeout'));
		input.data('timeout', setTimeout(() => {
			update_boq_item_current(itemName, newQty, frm);
		}, 500));
	});

	// Handle Value input change - auto-calculate Qty
	container.find('.current-value-input').on('change input', function () {
		const input = $(this);
		const itemName = input.data('item');
		const maxValue = parseFloat(input.data('max')) || 0;
		const rate = parseFloat(input.data('rate')) || 0;
		const prevAmount = parseFloat(input.data('prev-amount')) || 0;
		const totalAmount = parseFloat(input.data('total-amount')) || 0;
		let newValue = parseFloat(input.val()) || 0;

		if (newValue < 0) { newValue = 0; input.val(0); }
		if (newValue > maxValue) {
			frappe.show_alert({ message: __('Value cannot exceed balance'), indicator: 'orange' });
			newValue = maxValue;
			input.val(maxValue.toFixed(2));
		}

		// Auto-update qty input
		const row = input.closest('tr');
		const qtyInput = row.find('.current-qty-input');
		const newQty = rate > 0 ? newValue / rate : 0;
		qtyInput.val(newQty.toFixed(3));

		// Update display cells in real-time
		const accumAmount = prevAmount + newValue;
		const balanceAmount = totalAmount - accumAmount;

		row.find('.curr-amount-cell').text(format_currency(newValue));
		row.find('.accum-amount-cell').text(format_currency(accumAmount));
		row.find('.balance-cell').text(format_currency(balanceAmount));

		// Debounce the server update
		clearTimeout(input.data('timeout'));
		input.data('timeout', setTimeout(() => {
			update_boq_item_current(itemName, newQty, frm);
		}, 500));
	});
}

function update_boq_item_current(itemName, newQty, frm) {
	frappe.call({
		method: 'construction_management.api.boq_tree.update_boq_item_current',
		args: { boq_item: itemName, current_qty: newQty },
		callback: function (r) {
			if (r.message) {
				frappe.show_alert({ message: __('Updated'), indicator: 'green' });
				frappe.call({
					method: 'construction_management.api.boq_tree.get_boq_kpi',
					args: { project: frm.doc.name },
					callback: function (kpiRes) {
						if (kpiRes.message) {
							const kpi = kpiRes.message;
							const progress = kpi.total_boq_value > 0 ? ((kpi.total_billed / kpi.total_boq_value) * 100).toFixed(1) : 0;
							const collectionRate = kpi.total_billed > 0 ? ((kpi.total_collected / kpi.total_billed) * 100).toFixed(1) : 0;
							render_kpi_grid($('#kpi-grid'), kpi, progress, collectionRate);
						}
					}
				});
			}
		}
	});
}

window.toggleBill = function (header, event) {
	// Stop event propagation to prevent any parent handlers
	if (event) {
		event.stopPropagation();
		event.preventDefault();
	}

	const card = $(header).closest('.bill-card');
	const content = card.find('.bill-content');
	const isExpanded = card.hasClass('expanded');

	if (isExpanded) {
		content.stop(true, true).slideUp(200, function () {
			card.removeClass('expanded');
		});
	} else {
		card.addClass('expanded');
		content.stop(true, true).slideDown(200);
	}

	return false; // Prevent default behavior
};

function get_status_class(status) {
	switch (status) {
		case 'Fully Billed': return 'status-success';
		case 'Partially Billed': return 'status-warning';
		default: return 'status-default';
	}
}

function format_currency(value) {
	if (value === null || value === undefined) return '-';
	// Use only_value option to get plain text without HTML wrapper
	return frappe.format(value, { fieldtype: 'Currency' }, { only_value: true });
}

function format_number(value) {
	if (value === null || value === undefined) return '-';
	return frappe.format(value, { fieldtype: 'Float', precision: 3 }, { only_value: true });
}

// Global functions
window.create_project_boq = function (project) {
	const d = new frappe.ui.Dialog({
		title: 'Create Project BOQ',
		fields: [{ fieldname: 'boq_name', label: 'BOQ Name', fieldtype: 'Data', reqd: 1, default: `BOQ - ${project}` }],
		primary_action_label: 'Create',
		primary_action(values) {
			frappe.call({
				method: 'frappe.client.insert',
				args: { doc: { doctype: 'Project BOQ', project: project, boq_name: values.boq_name, status: 'Draft' } },
				callback: function (r) {
					if (r.message) { d.hide(); frappe.show_alert({ message: __('Project BOQ created'), indicator: 'green' }); cur_frm.reload_doc(); }
				}
			});
		}
	});
	d.show();
};

window.add_bill_number = function (project) {
	const d = new frappe.ui.Dialog({
		title: 'Add Bill Number',
		fields: [
			{ fieldname: 'bill_no', label: 'Bill Number', fieldtype: 'Data', reqd: 1, description: 'e.g., Bill No. 1 - Substructure Works' },
			{ fieldname: 'description', label: 'Description', fieldtype: 'Small Text' }
		],
		primary_action_label: 'Create',
		primary_action(values) {
			frappe.call({
				method: 'construction_management.api.boq_tree.create_bill_number',
				args: { project: project, bill_no: values.bill_no, description: values.description },
				callback: function (r) {
					if (r.message) { d.hide(); frappe.show_alert({ message: __('Bill Number created'), indicator: 'green' }); cur_frm.reload_doc(); }
				}
			});
		}
	});
	d.show();
};

window.add_boq_item = function (bill_name, project) {
	// Store materials data
	let materialsData = [];

	const d = new frappe.ui.Dialog({
		title: 'Add BOQ Item',
		size: 'large',
		fields: [
			// Row 1: Item Code, Unit, Total Quantity
			{ fieldname: 'item_code', label: 'Item Code', fieldtype: 'Data' },
			{ fieldtype: 'Column Break' },
			{ fieldname: 'unit', label: 'Unit', fieldtype: 'Link', options: 'UOM', reqd: 1 },
			{ fieldtype: 'Column Break' },
			{ fieldname: 'total_qty', label: 'Total Quantity', fieldtype: 'Float', reqd: 1 },

			// Row 2: Description, Rate, Total Amount
			{ fieldtype: 'Section Break' },
			{ fieldname: 'description', label: 'Description', fieldtype: 'Small Text', reqd: 1 },
			{ fieldtype: 'Column Break' },
			{ fieldname: 'rate', label: 'Rate', fieldtype: 'Currency', reqd: 1 },
			{ fieldtype: 'Column Break' },
			{ fieldname: 'total_amount', label: 'Total Amount', fieldtype: 'Currency', read_only: 1 },

			// Materials Section
			{ fieldtype: 'Section Break', label: 'Materials', collapsible: 1 },
			{ fieldname: 'materials_html', fieldtype: 'HTML' },

			// Estimated Costs Section
			{ fieldtype: 'Section Break', label: 'Estimated Costs', collapsible: 1 },
			{
				fieldname: 'cost_entry_mode', label: 'Cost Entry Mode', fieldtype: 'Select',
				options: 'Total Cost Only\nBreakdown', default: 'Total Cost Only',
				description: 'Choose how to enter estimated costs'
			},
			{
				fieldname: 'total_estimated_cost', label: 'Total Estimated Cost', fieldtype: 'Currency',
				depends_on: 'eval:doc.cost_entry_mode=="Total Cost Only"',
				description: 'Enter total estimated cost'
			},
			{ fieldtype: 'Column Break' },
			{
				fieldname: 'estimated_material_cost', label: 'Material Cost', fieldtype: 'Currency',
				depends_on: 'eval:doc.cost_entry_mode=="Breakdown"',
				description: 'Auto-calculated from materials if added'
			},
			{
				fieldname: 'estimated_labour_cost', label: 'Labour Cost', fieldtype: 'Currency',
				depends_on: 'eval:doc.cost_entry_mode=="Breakdown"'
			},
			{ fieldtype: 'Column Break' },
			{
				fieldname: 'estimated_subcontract_cost', label: 'Subcontract Cost', fieldtype: 'Currency',
				depends_on: 'eval:doc.cost_entry_mode=="Breakdown"'
			},
			{
				fieldname: 'estimated_asset_cost', label: 'Asset Cost', fieldtype: 'Currency',
				depends_on: 'eval:doc.cost_entry_mode=="Breakdown"'
			},
			{
				fieldname: 'estimated_other_cost', label: 'Other Costs', fieldtype: 'Currency',
				depends_on: 'eval:doc.cost_entry_mode=="Breakdown"'
			},
			{
				fieldname: 'calculated_total_cost', label: 'Total (Calculated)', fieldtype: 'Currency',
				depends_on: 'eval:doc.cost_entry_mode=="Breakdown"', read_only: 1
			},

			// Task Options Section
			{ fieldtype: 'Section Break', label: 'Task Options', collapsible: 1 },
			{
				fieldname: 'is_task', label: 'Create as Task', fieldtype: 'Check',
				description: 'Create a Group Task linked to this BOQ Item'
			},
			{ fieldtype: 'Column Break' },
			{ fieldname: 'start_date', label: 'Start Date', fieldtype: 'Date', depends_on: 'eval:doc.is_task==1' },
			{ fieldtype: 'Column Break' },
			{ fieldname: 'end_date', label: 'End Date', fieldtype: 'Date', depends_on: 'eval:doc.is_task==1' }
		],
		primary_action_label: 'Create',
		primary_action(values) {
			// Calculate costs based on entry mode
			let material_cost = 0, labour_cost = 0, subcontract_cost = 0, asset_cost = 0, other_cost = 0;

			if (values.cost_entry_mode === 'Breakdown') {
				material_cost = values.estimated_material_cost || 0;
				labour_cost = values.estimated_labour_cost || 0;
				subcontract_cost = values.estimated_subcontract_cost || 0;
				asset_cost = values.estimated_asset_cost || 0;
				other_cost = values.estimated_other_cost || 0;
			} else {
				// Total Cost Only mode - put all in other_cost for simplicity
				other_cost = values.total_estimated_cost || 0;
			}

			frappe.call({
				method: 'construction_management.api.boq_tasks.create_boq_item_with_task',
				args: {
					parent_bill: bill_name,
					item_code: values.item_code,
					description: values.description,
					unit: values.unit,
					total_qty: values.total_qty,
					rate: values.rate,
					is_task: values.is_task ? 1 : 0,
					start_date: values.start_date,
					end_date: values.end_date,
					estimated_material_cost: material_cost,
					estimated_labour_cost: labour_cost,
					estimated_subcontract_cost: subcontract_cost,
					estimated_asset_cost: asset_cost,
					estimated_other_cost: other_cost,
					total_estimated_cost: values.cost_entry_mode === 'Total Cost Only' ? (values.total_estimated_cost || 0) : 0,
					materials: JSON.stringify(materialsData)
				},
				callback: function (r) {
					if (r.message) {
						d.hide();
						let msg = __('BOQ Item created');
						if (r.message.task) {
							msg += __('. Task {0} also created', [r.message.task]);
						}
						frappe.show_alert({ message: msg, indicator: 'green' });
						cur_frm.reload_doc();
					}
				}
			});
		}
	});

	// Render materials section
	function renderMaterialsSection() {
		let html = `
			<div class="materials-container">
				<div class="materials-toolbar" style="margin-bottom: 10px;">
					<button class="btn btn-xs btn-primary add-material-btn">
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>
						</svg>
						Add Material
					</button>
					<span class="materials-total" style="margin-left: 15px; font-weight: 600;">
						Total: ${format_currency(materialsData.reduce((sum, m) => sum + (m.amount || 0), 0))}
					</span>
				</div>
				<div class="materials-list">
					${materialsData.length === 0 ? '<p class="text-muted">No materials added</p>' : ''}
					<table class="table table-bordered table-sm" style="${materialsData.length === 0 ? 'display:none' : ''}">
						<thead>
							<tr>
								<th>Item</th>
								<th style="width: 80px;">Qty</th>
								<th style="width: 100px;">Rate</th>
								<th style="width: 100px;">Amount</th>
								<th style="width: 40px;"></th>
							</tr>
						</thead>
						<tbody>
							${materialsData.map((m, idx) => `
								<tr data-idx="${idx}">
									<td>${m.item_name || m.item_code}</td>
									<td>${m.qty}</td>
									<td>${format_currency(m.rate)}</td>
									<td>${format_currency(m.amount)}</td>
									<td>
										<button class="btn btn-xs btn-danger remove-material-btn" data-idx="${idx}">
											<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
											</svg>
										</button>
									</td>
								</tr>
							`).join('')}
						</tbody>
					</table>
				</div>
			</div>
		`;
		d.fields_dict.materials_html.$wrapper.html(html);

		// Bind add material button
		d.fields_dict.materials_html.$wrapper.find('.add-material-btn').on('click', function (e) {
			e.preventDefault();
			showAddMaterialDialog();
		});

		// Bind remove buttons
		d.fields_dict.materials_html.$wrapper.find('.remove-material-btn').on('click', function (e) {
			e.preventDefault();
			const idx = $(this).data('idx');
			materialsData.splice(idx, 1);
			renderMaterialsSection();
			updateMaterialCost();
		});
	}

	function showAddMaterialDialog() {
		const matDialog = new frappe.ui.Dialog({
			title: 'Add Material',
			fields: [
				{ fieldname: 'item_code', label: 'Item', fieldtype: 'Link', options: 'Item', reqd: 1 },
				{ fieldname: 'item_name', label: 'Item Name', fieldtype: 'Data', read_only: 1 },
				{ fieldtype: 'Column Break' },
				{ fieldname: 'qty', label: 'Quantity', fieldtype: 'Float', reqd: 1 },
				{
					fieldname: 'rate', label: 'Valuation Rate', fieldtype: 'Currency', read_only: 1,
					description: 'Auto-fetched from stock valuation rate'
				},
				{ fieldname: 'amount', label: 'Amount', fieldtype: 'Currency', read_only: 1 }
			],
			primary_action_label: 'Add',
			primary_action: function (values) {
				if (!values.item_code || !values.qty) {
					frappe.show_alert({ message: 'Please select item and enter quantity', indicator: 'orange' });
					return;
				}
				materialsData.push({
					item_code: values.item_code,
					item_name: values.item_name,
					qty: values.qty,
					rate: values.rate || 0,
					amount: (values.qty || 0) * (values.rate || 0)
				});
				matDialog.hide();
				renderMaterialsSection();
				updateMaterialCost();
			}
		});

		// Fetch item details and valuation rate on selection
		matDialog.fields_dict.item_code.$input.on('change', function () {
			const item_code = matDialog.get_value('item_code');
			if (item_code) {
				// First get item name
				frappe.call({
					method: 'frappe.client.get_value',
					args: {
						doctype: 'Item',
						filters: { name: item_code },
						fieldname: ['item_name']
					},
					callback: function (r) {
						if (r.message) {
							matDialog.set_value('item_name', r.message.item_name);
						}
					}
				});

				// Get valuation rate from stock ledger
				frappe.call({
					method: 'construction_management.api.dpr_utils.get_item_valuation_rate',
					args: { item_code: item_code },
					callback: function (r) {
						if (r.message) {
							matDialog.set_value('rate', r.message.valuation_rate || 0);
							updateMatAmount();
						}
					}
				});
			}
		});

		// Update amount on qty change
		function updateMatAmount() {
			const qty = matDialog.get_value('qty') || 0;
			const rate = matDialog.get_value('rate') || 0;
			matDialog.set_value('amount', qty * rate);
		}

		matDialog.fields_dict.qty.$input.on('change', updateMatAmount);

		matDialog.show();
	}

	function updateMaterialCost() {
		const total = materialsData.reduce((sum, m) => sum + (m.amount || 0), 0);
		if (d.get_value('cost_entry_mode') === 'Breakdown') {
			d.set_value('estimated_material_cost', total);
		}
	}

	// Set up change handlers after dialog is created
	d.fields_dict.total_qty.$input.on('change', function () {
		let qty = d.get_value('total_qty') || 0;
		let rate = d.get_value('rate') || 0;
		d.set_value('total_amount', qty * rate);
	});

	d.fields_dict.rate.$input.on('change', function () {
		let qty = d.get_value('total_qty') || 0;
		let rate = d.get_value('rate') || 0;
		d.set_value('total_amount', qty * rate);
	});

	// Auto-calculate total when breakdown costs change
	const updateCalculatedTotal = function () {
		if (d.get_value('cost_entry_mode') === 'Breakdown') {
			const total = (d.get_value('estimated_material_cost') || 0) +
				(d.get_value('estimated_labour_cost') || 0) +
				(d.get_value('estimated_subcontract_cost') || 0) +
				(d.get_value('estimated_asset_cost') || 0) +
				(d.get_value('estimated_other_cost') || 0);
			d.set_value('calculated_total_cost', total);
		}
	};

	['estimated_material_cost', 'estimated_labour_cost', 'estimated_subcontract_cost',
		'estimated_asset_cost', 'estimated_other_cost'].forEach(function (fieldname) {
			if (d.fields_dict[fieldname] && d.fields_dict[fieldname].$input) {
				d.fields_dict[fieldname].$input.on('change', updateCalculatedTotal);
			}
		});

	d.show();

	// Render materials section after dialog is shown
	renderMaterialsSection();

	// Fix date picker z-index issue - ensure datepicker appears above modal
	setTimeout(function () {
		d.$wrapper.find('.datepicker').css('z-index', '2000');
		// Also fix the flatpickr calendar if used
		$('.flatpickr-calendar').css('z-index', '2100');
	}, 100);
};

window.edit_boq_item = function (item_name) { frappe.set_route('Form', 'BOQ Item', item_name); };

window.delete_boq_item = function (item_name) {
	frappe.confirm(
		__('Are you sure you want to delete this BOQ Item? This action cannot be undone.'),
		function () {
			frappe.call({
				method: 'frappe.client.delete',
				args: {
					doctype: 'BOQ Item',
					name: item_name
				},
				callback: function (r) {
					if (!r.exc) {
						frappe.show_alert({ message: __('BOQ Item deleted successfully'), indicator: 'green' });
						// Refresh the BOQ management table
						if (cur_frm && cur_frm.reload_doc) {
							cur_frm.reload_doc();
						}
					}
				},
				error: function (r) {
					frappe.show_alert({ message: __('Cannot delete BOQ Item: {0}', [r.message || 'Unknown error']), indicator: 'red' });
				}
			});
		}
	);
};

window.create_item_invoice = function (boq_item) {
	const input = $(`.current-qty-input[data-item="${boq_item}"]`);
	const currentQty = parseFloat(input.val()) || 0;

	if (currentQty <= 0) {
		frappe.show_alert({ message: __('Please enter a quantity to bill'), indicator: 'orange' });
		return;
	}

	// Show dialog with proforma option
	const d = new frappe.ui.Dialog({
		title: __('Create Invoice'),
		fields: [
			{ fieldname: 'qty', label: 'Quantity', fieldtype: 'Float', read_only: 1, default: currentQty },
			{
				fieldname: 'is_proforma', label: 'Create as Proforma', fieldtype: 'Check', default: 0,
				description: 'Proforma invoices remain in Draft status for customer approval'
			},
			{ fieldtype: 'Section Break' },
			{ fieldname: 'apply_retention', label: 'Apply Retention', fieldtype: 'Check', default: 1 },
			{ fieldname: 'advance_deduction', label: 'Advance Deduction', fieldtype: 'Currency', default: 0 }
		],
		primary_action_label: __('Create Invoice'),
		primary_action: function (values) {
			frappe.call({
				method: 'construction_management.api.boq_invoice.create_invoice_from_boq_item',
				args: {
					project: cur_frm.doc.name,
					boq_item: boq_item,
					current_qty: currentQty,
					apply_retention: values.apply_retention ? 1 : 0,
					advance_deduction: values.advance_deduction || 0,
					is_proforma: values.is_proforma ? 1 : 0
				},
				callback: function (r) {
					if (r.message) {
						d.hide();
						const invoiceType = values.is_proforma ? 'Proforma Invoice' : 'Invoice';
						frappe.show_alert({ message: __(`${invoiceType} {0} created`, [r.message.invoice]), indicator: 'green' });
						frappe.set_route('Form', 'Sales Invoice', r.message.invoice);
					}
				}
			});
		}
	});
	d.show();
};

window.view_item_invoices = function (boq_item) {
	frappe.call({
		method: 'construction_management.api.boq_invoice.get_boq_invoice_history',
		args: { boq_item: boq_item },
		callback: function (r) { if (r.message) show_invoice_dialog(boq_item, r.message); }
	});
};

function show_invoice_dialog(boq_item, data) {
	const summary = data.summary || {};
	const boqItem = data.boq_item || {};
	const ledgerEntries = data.ledger_entries || [];
	const paymentCertificates = data.payment_certificates || [];
	const pendingProformas = data.pending_proformas || [];
	const pcSummary = data.pc_summary || {};

	// Build ledger entries table with prev/curr/accumulated columns
	let ledgerRows = ledgerEntries.length > 0 ? ledgerEntries.map((entry, idx) => {
		const refLink = entry.reference_doctype === 'Sales Invoice' && entry.reference_name
			? `<a href="/app/sales-invoice/${entry.reference_name}" class="invoice-link">${entry.reference_name}</a>`
			: (entry.reference_name || '-');

		const statusClass = entry.invoice_status === 'Paid' ? 'status-success' :
			(entry.invoice_status === 'Unpaid' || entry.invoice_status === 'Overdue') ? 'status-warning' : 'status-default';

		const typeLabel = entry.is_proforma ? '<span class="type-badge proforma">Proforma</span>' : '<span class="type-badge tax">Tax Inv</span>';

		return `
		<tr>
			<td class="text-center">${idx + 1}</td>
			<td>${entry.posting_date}</td>
			<td>${refLink}</td>
			<td class="text-center">${typeLabel}</td>
			<td class="text-center">${entry.unit || '-'}</td>
			<td class="text-right col-prev">${format_number(entry.prev_qty)}</td>
			<td class="text-right col-curr">${format_number(entry.current_qty)}</td>
			<td class="text-right col-accum font-bold">${format_number(entry.accumulated_qty)}</td>
			<td class="text-right col-prev">${format_currency(entry.prev_amount)}</td>
			<td class="text-right col-curr">${format_currency(entry.current_amount)}</td>
			<td class="text-right col-accum font-bold">${format_currency(entry.accumulated_amount)}</td>
			<td class="text-center">${entry.pay_cert ? `<a href="/app/payment-certificate/${entry.pay_cert}">${entry.pay_cert}</a>` : '-'}</td>
			<td><span class="status-pill ${statusClass}">${entry.invoice_status || entry.source}</span></td>
		</tr>
		`;
	}).join('') : '<tr><td colspan="13" class="text-center text-muted">No billing history found</td></tr>';

	// Build payment certificates table with cumulative columns
	let cumulativeProforma = 0;
	let cumulativeTaxInvoice = 0;
	let pcRows = paymentCertificates.length > 0 ? paymentCertificates.map((pc, idx) => {
		const statusClass = pc.status === 'Paid' ? 'status-success' :
			(pc.status === 'Invoiced' || pc.status === 'Submitted') ? 'status-info' : 'status-warning';
		const varianceClass = pc.variance > 0 ? 'text-danger' : (pc.variance < 0 ? 'text-success' : '');

		// Calculate cumulative values
		cumulativeProforma += parseFloat(pc.proforma_amount) || 0;
		cumulativeTaxInvoice += parseFloat(pc.accepted_amount) || 0;

		// Determine if Submit button should be shown
		const canSubmit = pc.status === 'Draft' && pc.docstatus === 0;
		const submitButton = canSubmit ?
			`<button class="btn btn-xs btn-success" onclick="submit_payment_certificate('${pc.name}', '${boq_item}')">Submit</button>` :
			'-';

		return `
		<tr>
			<td class="text-center">${idx + 1}</td>
			<td>${pc.posting_date}</td>
			<td><a href="/app/payment-certificate/${pc.name}" class="invoice-link">${pc.name}</a></td>
			<td>${pc.proforma_invoice ? `<a href="/app/sales-invoice/${pc.proforma_invoice}">${pc.proforma_invoice}</a>` : '-'}</td>
			<td class="text-right">${format_currency(pc.proforma_amount)}</td>
			<td class="text-right col-accum font-bold">${format_currency(cumulativeProforma)}</td>
			<td class="text-right font-bold">${format_currency(pc.accepted_amount)}</td>
			<td class="text-right col-accum font-bold">${format_currency(cumulativeTaxInvoice)}</td>
			<td class="text-right ${varianceClass}">${format_currency(pc.variance)}</td>
			<td>${pc.tax_invoice ? `<a href="/app/sales-invoice/${pc.tax_invoice}">${pc.tax_invoice}</a>` : '-'}</td>
			<td class="text-right">${format_currency(pc.payment_received || 0)}</td>
			<td><span class="status-pill ${statusClass}">${pc.status}</span></td>
			<td class="text-center">${submitButton}</td>
		</tr>
		`;
	}).join('') : '<tr><td colspan="13" class="text-center text-muted">No payment certificates found</td></tr>';

	// Build pending proformas table
	let proformaRows = pendingProformas.length > 0 ? pendingProformas.map((p, idx) => {
		const ageClass = p.age_days > 30 ? 'text-danger' : (p.age_days > 14 ? 'text-warning' : '');
		return `
		<tr>
			<td class="text-center">${idx + 1}</td>
			<td>${p.posting_date}</td>
			<td><a href="/app/sales-invoice/${p.name}" class="invoice-link">${p.name}</a></td>
			<td class="text-right">${format_currency(p.grand_total)}</td>
			<td class="text-center ${ageClass}">${p.age_days} days</td>
			<td>
				<button class="btn btn-xs btn-primary" onclick="create_pc_from_history('${p.name}', ${p.grand_total}, '${boq_item}')">
					Create PC
				</button>
			</td>
		</tr>
		`;
	}).join('') : '<tr><td colspan="6" class="text-center text-muted">No pending proformas</td></tr>';

	// Aggressive cleanup of any stale backdrops before opening
	cleanup_modal_backdrop();

	const d = new frappe.ui.Dialog({ title: __('Invoice History - Progressive Billing'), size: 'extra-large', fields: [{ fieldtype: 'HTML', fieldname: 'invoice_html' }] });
	d.fields_dict.invoice_html.$wrapper.html(`
		<div class="boq-item-header">
			<div class="boq-item-desc">${boqItem.description || 'BOQ Item'}</div>
			<div class="boq-item-meta">
				<span><strong>Unit:</strong> ${boqItem.unit || '-'}</span>
				<span><strong>Rate:</strong> ${format_currency(boqItem.rate)}</span>
				<span><strong>Total Qty:</strong> ${format_number(boqItem.total_qty)}</span>
				<span><strong>Total Amount:</strong> ${format_currency(boqItem.total_amount)}</span>
			</div>
		</div>
		<div class="invoice-summary-grid">
			<div class="summary-card"><span class="summary-label">Total Invoices</span><span class="summary-value">${summary.invoice_count || 0}</span></div>
			<div class="summary-card info"><span class="summary-label">Accumulated Qty</span><span class="summary-value">${format_number(summary.accumulated_qty)}</span></div>
			<div class="summary-card info"><span class="summary-label">Accumulated Amount</span><span class="summary-value">${format_currency(summary.accumulated_amount)}</span></div>
			<div class="summary-card success"><span class="summary-label">Collected</span><span class="summary-value">${format_currency(summary.total_collected)}</span></div>
			<div class="summary-card warning"><span class="summary-label">Pending Payment</span><span class="summary-value">${format_currency(summary.pending)}</span></div>
			<div class="summary-card balance"><span class="summary-label">Balance Qty</span><span class="summary-value">${format_number(summary.balance_qty)}</span></div>
			<div class="summary-card balance"><span class="summary-label">Balance Amount</span><span class="summary-value">${format_currency(summary.balance_amount)}</span></div>
		</div>
		
		<!-- Payment Certificate Summary -->
		<div class="pc-summary-section">
			<h4 style="margin: 20px 0 10px; font-size: 14px; font-weight: 600;">📋 Payment Certificate Summary</h4>
			<div class="pc-summary-grid">
				<div class="pc-stat proforma"><span class="pc-stat-label">Total Proforma</span><span class="pc-stat-value">${format_currency(pcSummary.total_proforma || 0)}</span></div>
				<div class="pc-stat accepted"><span class="pc-stat-label">Total Accepted</span><span class="pc-stat-value">${format_currency(pcSummary.total_accepted || 0)}</span></div>
				<div class="pc-stat variance"><span class="pc-stat-label">Total Variance</span><span class="pc-stat-value">${format_currency(pcSummary.total_variance || 0)}</span></div>
				<div class="pc-stat received"><span class="pc-stat-label">Total Received</span><span class="pc-stat-value">${format_currency(pcSummary.total_received || 0)}</span></div>
				<div class="pc-stat pending-proforma"><span class="pc-stat-label">Pending Proformas</span><span class="pc-stat-value">${pcSummary.pending_proforma_count || 0} (${format_currency(pcSummary.pending_proforma_amount || 0)})</span></div>
			</div>
		</div>
		
		<!-- Tabs for different views -->
		<div class="invoice-tabs">
			<div class="tab-buttons">
				<button class="tab-btn active" data-tab="ledger">📊 Progress Ledger</button>
				<button class="tab-btn" data-tab="certificates">📜 Payment Certificates (${paymentCertificates.length})</button>
				<button class="tab-btn ${pendingProformas.length > 0 ? 'has-pending' : ''}" data-tab="proformas">⏳ Pending Proformas (${pendingProformas.length})</button>
			</div>
			
			<div class="tab-content active" data-content="ledger">
				<div class="ledger-table-wrapper">
					<table class="invoice-history-table ledger-table">
						<thead>
							<tr>
								<th rowspan="2" class="text-center">#</th>
								<th rowspan="2">Date</th>
								<th rowspan="2">Reference</th>
								<th rowspan="2" class="text-center">Type</th>
								<th rowspan="2" class="text-center">Unit</th>
								<th colspan="3" class="text-center col-group-qty">Quantity</th>
								<th colspan="3" class="text-center col-group-amt">Amount</th>
								<th rowspan="2" class="text-center">Pay Cert</th>
								<th rowspan="2">Status</th>
							</tr>
							<tr>
								<th class="text-right col-prev">Prev</th>
								<th class="text-right col-curr">Curr</th>
								<th class="text-right col-accum">Accum</th>
								<th class="text-right col-prev">Prev</th>
								<th class="text-right col-curr">Curr</th>
								<th class="text-right col-accum">Accum</th>
							</tr>
						</thead>
						<tbody>${ledgerRows}</tbody>
					</table>
				</div>
			</div>
			
			<div class="tab-content" data-content="certificates">
				<div class="ledger-table-wrapper">
					<table class="invoice-history-table">
						<thead>
							<tr>
								<th rowspan="2" class="text-center">#</th>
								<th rowspan="2">Date</th>
								<th rowspan="2">PC Number</th>
								<th rowspan="2">Proforma Invoice</th>
								<th colspan="2" class="text-center col-group-proforma">Proforma Amount</th>
								<th colspan="2" class="text-center col-group-tax">Tax Invoice Amount</th>
								<th rowspan="2" class="text-right">Variance</th>
								<th rowspan="2">Tax Invoice</th>
								<th rowspan="2" class="text-right">Received</th>
								<th rowspan="2">Status</th>
								<th rowspan="2" class="text-center">Actions</th>
							</tr>
							<tr>
								<th class="text-right col-curr">Current</th>
								<th class="text-right col-accum">Cumulative</th>
								<th class="text-right col-curr">Current</th>
								<th class="text-right col-accum">Cumulative</th>
							</tr>
						</thead>
						<tbody>${pcRows}</tbody>
					</table>
				</div>
			</div>
			
			<div class="tab-content" data-content="proformas">
				<div class="ledger-table-wrapper">
					<table class="invoice-history-table">
						<thead>
							<tr>
								<th class="text-center">#</th>
								<th>Date</th>
								<th>Proforma Invoice</th>
								<th class="text-right">Amount</th>
								<th class="text-center">Age</th>
								<th>Action</th>
							</tr>
						</thead>
						<tbody>${proformaRows}</tbody>
					</table>
				</div>
			</div>
		</div>
		
		<style>
			.boq-item-header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px; border-radius: 8px; margin-bottom: 16px; }
			.boq-item-desc { font-size: 15px; font-weight: 600; margin-bottom: 8px; }
			.boq-item-meta { display: flex; gap: 20px; font-size: 12px; opacity: 0.9; flex-wrap: wrap; }
			.invoice-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 20px; }
			.summary-card { background: #f8f9fa; border-radius: 8px; padding: 14px; text-align: center; }
			.summary-card.info { background: #e0f2fe; }
			.summary-card.success { background: #d1fae5; }
			.summary-card.warning { background: #fef3c7; }
			.summary-card.balance { background: #ede9fe; }
			.summary-label { display: block; font-size: 10px; color: #6c757d; margin-bottom: 4px; text-transform: uppercase; }
			.summary-value { display: block; font-size: 16px; font-weight: 600; }
			
			/* PC Summary */
			.pc-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 16px; }
			.pc-stat { background: #f8f9fa; border-radius: 6px; padding: 10px; text-align: center; border-left: 3px solid #6b7280; }
			.pc-stat.proforma { border-left-color: #8b5cf6; background: #f5f3ff; }
			.pc-stat.accepted { border-left-color: #10b981; background: #ecfdf5; }
			.pc-stat.variance { border-left-color: #f59e0b; background: #fffbeb; }
			.pc-stat.received { border-left-color: #3b82f6; background: #eff6ff; }
			.pc-stat.pending-proforma { border-left-color: #ef4444; background: #fef2f2; }
			.pc-stat-label { display: block; font-size: 9px; color: #6b7280; text-transform: uppercase; margin-bottom: 2px; }
			.pc-stat-value { display: block; font-size: 13px; font-weight: 600; }
			
			/* Tabs */
			.invoice-tabs { margin-top: 16px; }
			.tab-buttons { display: flex; gap: 8px; border-bottom: 2px solid #e5e7eb; padding-bottom: 0; margin-bottom: 16px; }
			.tab-btn { padding: 10px 16px; border: none; background: none; cursor: pointer; font-size: 13px; font-weight: 500; color: #6b7280; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s; }
			.tab-btn:hover { color: #374151; }
			.tab-btn.active { color: #5e64ff; border-bottom-color: #5e64ff; }
			.tab-btn.has-pending { color: #ef4444; }
			.tab-btn.has-pending.active { border-bottom-color: #ef4444; }
			.tab-content { display: none; }
			.tab-content.active { display: block; }
			
			/* Type badges */
			.type-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; text-transform: uppercase; }
			.type-badge.proforma { background: #f5f3ff; color: #7c3aed; }
			.type-badge.tax { background: #ecfdf5; color: #059669; }
			
			.ledger-table-wrapper { overflow-x: auto; }
			.invoice-history-table { width: 100%; border-collapse: collapse; font-size: 12px; }
			.invoice-history-table th, .invoice-history-table td { padding: 10px 8px; border-bottom: 1px solid #e9ecef; }
			.invoice-history-table th { background: #f8f9fa; font-weight: 500; font-size: 10px; text-transform: uppercase; white-space: nowrap; }
			.col-group-qty { background: #eff6ff !important; }
			.col-group-amt { background: #f0fdf4 !important; }
			.col-group-proforma { background: #f5f3ff !important; }
			.col-group-tax { background: #ecfdf5 !important; }
			.col-prev { background: #fafafa; }
			.col-curr { background: #fffbeb; }
			.col-accum { background: #f0fdf4; }
			.font-bold { font-weight: 600; }
			.invoice-link { color: #5e64ff; text-decoration: none; font-weight: 500; }
			.invoice-link:hover { text-decoration: underline; }
			.status-pill { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 10px; font-weight: 500; }
			.status-success { background: #d1fae5; color: #065f46; }
			.status-warning { background: #fef3c7; color: #92400e; }
			.status-info { background: #dbeafe; color: #1e40af; }
			.status-default { background: #f3f4f6; color: #6b7280; }
			.text-danger { color: #dc2626; }
			.text-success { color: #059669; }
			.text-warning { color: #d97706; }
		</style>
	`);

	// Tab switching
	d.$wrapper.find('.tab-btn').on('click', function () {
		const tab = $(this).data('tab');
		d.$wrapper.find('.tab-btn').removeClass('active');
		$(this).addClass('active');
		d.$wrapper.find('.tab-content').removeClass('active');
		d.$wrapper.find(`.tab-content[data-content="${tab}"]`).addClass('active');
	});

	// Set Project Site requirement based on BOQ Settings
	set_project_site_requirement(d, project);

	// Fix: Ensure proper cleanup when dialog is closed
	d.onhide = function () {
		cleanup_modal_and_restore_dashboard();
	};

	d.show();

	// Ensure dashboard stays visible when modal opens
	ensure_dashboard_visible();
}

// Helper function to create payment certificate from invoice history dialog
window.create_pc_from_history = function (proforma_invoice, proforma_amount, boq_item) {
	const d = new frappe.ui.Dialog({
		title: __('Create Payment Certificate'),
		fields: [
			{ fieldname: 'proforma_invoice', label: 'Proforma Invoice', fieldtype: 'Link', options: 'Sales Invoice', read_only: 1, default: proforma_invoice },
			{ fieldname: 'proforma_amount', label: 'Proforma Amount', fieldtype: 'Currency', read_only: 1, default: proforma_amount },
			{ fieldtype: 'Column Break' },
			{
				fieldname: 'accepted_amount', label: 'Accepted Amount', fieldtype: 'Currency', reqd: 1, default: proforma_amount,
				description: 'Amount approved by customer'
			},
			{ fieldtype: 'Section Break' },
			{ fieldname: 'remarks', label: 'Remarks', fieldtype: 'Small Text' }
		],
		primary_action_label: __('Create'),
		primary_action: function (values) {
			frappe.call({
				method: 'construction_management.construction_management.doctype.payment_certificate.payment_certificate.create_payment_certificate_from_proforma',
				args: {
					proforma_invoice: proforma_invoice,
					accepted_amount: values.accepted_amount,
					remarks: values.remarks
				},
				callback: function (r) {
					if (r.message) {
						d.hide();
						frappe.show_alert({ message: __('Payment Certificate {0} created', [r.message.name]), indicator: 'green' });
						// Refresh the invoice history dialog
						view_item_invoices(boq_item);
					}
				}
			});
		}
	});
	// Fix: Ensure proper cleanup when dialog is closed
	d.onhide = function () {
		cleanup_modal_and_restore_dashboard();
	};
	d.show();
	ensure_dashboard_visible();
};

// Helper function to submit payment certificate from invoice history dialog
window.submit_payment_certificate = function (pc_name, boq_item) {
	frappe.confirm(
		__('Are you sure you want to submit Payment Certificate {0}? This will create a Tax Invoice.', [pc_name]),
		function () {
			frappe.call({
				method: 'frappe.client.submit',
				args: {
					doc: {
						doctype: 'Payment Certificate',
						name: pc_name
					}
				},
				callback: function (r) {
					if (r.message) {
						frappe.show_alert({
							message: __('Payment Certificate {0} submitted successfully', [pc_name]),
							indicator: 'green'
						});
						// Refresh the invoice history dialog to show updated status
						setTimeout(() => {
							view_item_invoices(boq_item);
						}, 500);
					}
				},
				error: function (r) {
					frappe.msgprint({
						title: __('Submission Failed'),
						message: r.message || __('Could not submit Payment Certificate'),
						indicator: 'red'
					});
				}
			});
		}
	);
};

window.view_cost_details = function (boq_item) {
	// Fetch both cost details and cost progress
	Promise.all([
		new Promise((resolve) => {
			frappe.call({
				method: 'construction_management.api.boq_tree.get_boq_item_cost_details',
				args: { boq_item: boq_item },
				callback: function (r) { resolve(r.message); }
			});
		}),
		new Promise((resolve) => {
			frappe.call({
				method: 'construction_management.api.boq_tree.get_boq_item_cost_progress',
				args: { boq_item: boq_item },
				callback: function (r) { resolve(r.message); }
			});
		})
	]).then(([costDetails, costProgress]) => {
		show_cost_dialog(boq_item, costDetails, costProgress);
	});
};

function show_cost_dialog(boq_item, data, progressData) {
	const cost = data.cost || {};
	const revenue = data.revenue || {};
	const margin = (revenue.to_date || 0) - (cost.total || 0);
	const marginPercent = revenue.to_date > 0 ? ((margin / revenue.to_date) * 100).toFixed(1) : 0;

	// Cost progress data
	const hasEstimates = progressData && progressData.has_estimates;
	const estimated = progressData ? progressData.estimated : {};
	const incurred = progressData ? progressData.incurred : {};
	const variance = progressData ? progressData.variance : {};
	const progressPercent = progressData ? progressData.progress_percentage : 0;
	const isOverrun = progressData ? progressData.is_overrun : false;

	// Build cost progress section HTML
	let costProgressHtml = '';
	if (hasEstimates) {
		costProgressHtml = `
			<div class="cost-progress-section">
				<h4>📊 Cost Progress (Estimated vs Incurred)</h4>
				<div class="progress-bar-container">
					<div class="progress-bar-wrapper">
						<div class="progress-bar-fill ${isOverrun ? 'overrun' : ''}" style="width: ${Math.min(progressPercent, 100)}%"></div>
					</div>
					<span class="progress-label ${isOverrun ? 'overrun' : ''}">${progressPercent.toFixed(1)}%</span>
				</div>
				<div class="progress-summary">
					<span class="progress-stat"><strong>Estimated:</strong> ${format_currency(estimated.total || 0)}</span>
					<span class="progress-stat"><strong>Incurred:</strong> ${format_currency(incurred.total || 0)}</span>
					<span class="progress-stat ${variance.total >= 0 ? 'positive' : 'negative'}"><strong>Variance:</strong> ${format_currency(variance.total || 0)}</span>
				</div>
				<table class="cost-progress-table">
					<thead>
						<tr>
							<th>Category</th>
							<th class="text-right">Estimated</th>
							<th class="text-right">Incurred</th>
							<th class="text-right">Variance</th>
							<th class="text-right">Progress</th>
						</tr>
					</thead>
					<tbody>
						${render_cost_progress_row('Material', estimated.material, incurred.material, variance.material)}
						${render_cost_progress_row('Labour', estimated.labour, incurred.labour, variance.labour)}
						${render_cost_progress_row('Subcontract', estimated.subcontract, incurred.subcontract, variance.subcontract)}
						${render_cost_progress_row('Asset', estimated.asset, incurred.asset, variance.asset)}
						${render_cost_progress_row('Other', estimated.other, incurred.other, variance.other)}
						<tr class="total-row">
							<td><strong>Total</strong></td>
							<td class="text-right"><strong>${format_currency(estimated.total || 0)}</strong></td>
							<td class="text-right"><strong>${format_currency(incurred.total || 0)}</strong></td>
							<td class="text-right ${variance.total >= 0 ? 'text-success' : 'text-danger'}"><strong>${format_currency(variance.total || 0)}</strong></td>
							<td class="text-right"><strong>${progressPercent.toFixed(1)}%</strong></td>
						</tr>
					</tbody>
				</table>
			</div>
		`;
	}

	const d = new frappe.ui.Dialog({ title: __('Cost Details - Expenses Breakdown'), size: 'large', fields: [{ fieldtype: 'HTML', fieldname: 'cost_html' }] });
	d.fields_dict.cost_html.$wrapper.html(`
		${costProgressHtml}
		<div class="cost-summary-section">
			<h4>Revenue vs Cost Summary</h4>
			<div class="cost-summary-grid">
				<div class="summary-card info"><span class="summary-label">Total Revenue</span><span class="summary-value">${format_currency(revenue.to_date)}</span></div>
				<div class="summary-card warning"><span class="summary-label">Total Cost</span><span class="summary-value">${format_currency(cost.total)}</span></div>
				<div class="summary-card ${margin >= 0 ? 'success' : 'danger'}"><span class="summary-label">Margin</span><span class="summary-value">${format_currency(margin)}</span><span class="summary-sub">${marginPercent}%</span></div>
			</div>
		</div>
		<div class="cost-breakdown-section">
			<h4>Expenses by Breakup</h4>
			<table class="cost-breakdown-table">
				<thead><tr><th>Cost Type</th><th class="text-right">Amount</th><th class="text-right">% of Total</th></tr></thead>
				<tbody>
					<tr><td><span class="cost-badge labour">Labour</span></td><td class="text-right">${format_currency(cost.labour)}</td><td class="text-right">${cost.total > 0 ? ((cost.labour / cost.total) * 100).toFixed(1) : 0}%</td></tr>
					<tr><td><span class="cost-badge material">Material</span></td><td class="text-right">${format_currency(cost.material)}</td><td class="text-right">${cost.total > 0 ? ((cost.material / cost.total) * 100).toFixed(1) : 0}%</td></tr>
					<tr><td><span class="cost-badge asset">Asset</span></td><td class="text-right">${format_currency(cost.asset)}</td><td class="text-right">${cost.total > 0 ? ((cost.asset / cost.total) * 100).toFixed(1) : 0}%</td></tr>
					<tr><td><span class="cost-badge subcontract">Subcontract (S/C)</span></td><td class="text-right">${format_currency(cost.subcontract)}</td><td class="text-right">${cost.total > 0 ? ((cost.subcontract / cost.total) * 100).toFixed(1) : 0}%</td></tr>
					<tr><td><span class="cost-badge expense">Other Expense</span></td><td class="text-right">${format_currency(cost.expense)}</td><td class="text-right">${cost.total > 0 ? ((cost.expense / cost.total) * 100).toFixed(1) : 0}%</td></tr>
					<tr><td><span class="cost-badge overhead">Overhead</span></td><td class="text-right">${format_currency(cost.overhead || 0)}</td><td class="text-right">${cost.total > 0 ? (((cost.overhead || 0) / cost.total) * 100).toFixed(1) : 0}%</td></tr>
					<tr class="total-row"><td><strong>Total</strong></td><td class="text-right"><strong>${format_currency(cost.total)}</strong></td><td class="text-right"><strong>100%</strong></td></tr>
				</tbody>
			</table>
		</div>
		<style>
			.cost-progress-section { margin-bottom: 24px; padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
			.cost-progress-section h4 { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #374151; }
			.progress-bar-container { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
			.progress-bar-wrapper { flex: 1; height: 24px; background: #e5e7eb; border-radius: 12px; overflow: hidden; }
			.progress-bar-fill { height: 100%; background: linear-gradient(90deg, #10b981, #34d399); border-radius: 12px; transition: width 0.3s ease; }
			.progress-bar-fill.overrun { background: linear-gradient(90deg, #ef4444, #f87171); }
			.progress-label { font-size: 16px; font-weight: 600; color: #374151; min-width: 60px; }
			.progress-label.overrun { color: #ef4444; }
			.progress-summary { display: flex; gap: 24px; margin-bottom: 16px; flex-wrap: wrap; }
			.progress-stat { font-size: 13px; color: #6b7280; }
			.progress-stat.positive { color: #059669; }
			.progress-stat.negative { color: #dc2626; }
			.cost-progress-table { width: 100%; border-collapse: collapse; font-size: 13px; }
			.cost-progress-table th, .cost-progress-table td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
			.cost-progress-table th { background: #f1f5f9; font-weight: 500; font-size: 11px; text-transform: uppercase; color: #64748b; }
			.cost-progress-table .total-row { background: #f1f5f9; font-weight: 600; }
			.text-success { color: #059669; }
			.text-danger { color: #dc2626; }
			.cost-summary-section, .cost-breakdown-section { margin-bottom: 24px; }
			.cost-summary-section h4, .cost-breakdown-section h4 { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #374151; }
			.cost-summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
			.summary-card { background: #f8f9fa; border-radius: 8px; padding: 16px; text-align: center; }
			.summary-card.info { background: #dbeafe; }
			.summary-card.success { background: #d1fae5; }
			.summary-card.warning { background: #fef3c7; }
			.summary-card.danger { background: #fee2e2; }
			.summary-label { display: block; font-size: 11px; color: #6c757d; margin-bottom: 4px; text-transform: uppercase; }
			.summary-value { display: block; font-size: 20px; font-weight: 600; }
			.summary-sub { display: block; font-size: 12px; color: #6b7280; margin-top: 4px; }
			.cost-breakdown-table { width: 100%; border-collapse: collapse; }
			.cost-breakdown-table th, .cost-breakdown-table td { padding: 12px; border-bottom: 1px solid #e9ecef; }
			.cost-breakdown-table th { background: #f8f9fa; font-weight: 500; font-size: 11px; text-transform: uppercase; }
			.cost-breakdown-table .total-row { background: #f8f9fa; }
			.cost-badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 500; }
			.cost-badge.labour { background: #dbeafe; color: #1e40af; }
			.cost-badge.material { background: #fef3c7; color: #92400e; }
			.cost-badge.asset { background: #e0e7ff; color: #3730a3; }
			.cost-badge.subcontract { background: #d1fae5; color: #065f46; }
			.cost-badge.expense { background: #fce7f3; color: #9d174d; }
			.cost-badge.overhead { background: #f3e8ff; color: #7c3aed; }
		</style>
	`);
	// Fix: Ensure proper cleanup when dialog is closed
	d.onhide = function () {
		cleanup_modal_and_restore_dashboard();
	};
	d.show();
	ensure_dashboard_visible();
}

function render_cost_progress_row(category, estimated, incurred, variance) {
	const est = flt(estimated) || 0;
	const inc = flt(incurred) || 0;
	const vari = flt(variance) || 0;
	const progress = est > 0 ? ((inc / est) * 100).toFixed(1) : (inc > 0 ? '100.0' : '0.0');
	const varianceClass = vari >= 0 ? 'text-success' : 'text-danger';

	return `
		<tr>
			<td>${category}</td>
			<td class="text-right">${format_currency(est)}</td>
			<td class="text-right">${format_currency(inc)}</td>
			<td class="text-right ${varianceClass}">${format_currency(vari)}</td>
			<td class="text-right">${progress}%</td>
		</tr>
	`;
}

// ============================================
// Item Advances View (Task 9.4)
// ============================================

window.view_item_advances = function (boq_item) {
	frappe.call({
		method: 'construction_management.api.boq_tree.get_boq_item_advances',
		args: { boq_item: boq_item },
		callback: function (r) {
			if (r.message && r.message.length > 0) {
				show_item_advances_dialog(boq_item, r.message);
			} else {
				frappe.msgprint(__('No advance payments found for this item.'));
			}
		}
	});
};

function show_item_advances_dialog(boq_item, advances) {
	const total_amount = advances.reduce((sum, adv) => sum + flt(adv.amount), 0);

	const advancesHtml = `
		<div class="item-advances-wrapper">
			<div class="advances-summary-mini" style="margin-bottom: 15px; padding: 10px; background: #f0f9ff; border-radius: 6px; border: 1px solid #bae6fd;">
				<span style="font-size: 13px; color: #0369a1;">Total Advances: <strong>${format_currency(total_amount)}</strong></span>
			</div>
			<table class="table table-bordered" style="font-size: 12px;">
				<thead style="background: #f8f9fa;">
					<tr>
						<th>Ref #</th>
						<th>Date</th>
						<th class="text-right">Amount</th>
						<th>Status</th>
						<th>Remarks</th>
					</tr>
				</thead>
				<tbody>
					${advances.map(adv => `
						<tr>
							<td><a href="/app/boq-advance-payment/${adv.name}">${adv.name}</a></td>
							<td>${frappe.datetime.str_to_user(adv.date)}</td>
							<td class="text-right" style="font-weight: 600;">${format_currency(adv.amount)}</td>
							<td><span class="indicator-pill ${get_advance_status_color(adv.status)}">${adv.status}</span></td>
							<td style="font-size: 11px; color: #666;">${adv.remarks || '-'}</td>
						</tr>
					`).join('')}
				</tbody>
			</table>
		</div>
	`;

	const d = new frappe.ui.Dialog({
		title: __('Advance Payments - {0}', [boq_item]),
		size: 'large',
		fields: [
			{
				fieldtype: 'HTML',
				fieldname: 'advances_html',
				options: advancesHtml
			}
		]
	});

	// Set Project Site requirement based on BOQ Settings
	set_project_site_requirement(d, project);

	d.onhide = function () {
		cleanup_modal_and_restore_dashboard();
	};
	d.show();
	ensure_dashboard_visible();
}

// ============================================
// Bill Advances View (Task 9.3)
// ============================================

window.view_bill_advances = function (bill_no) {
	frappe.call({
		method: 'construction_management.api.boq_invoice.get_bill_advances',
		args: { bill_no: bill_no },
		callback: function (r) {
			if (r.message) {
				show_bill_advances_dialog(bill_no, r.message);
			} else {
				frappe.msgprint(__('No advances found for this bill.'));
			}
		}
	});
};

function show_bill_advances_dialog(bill_no, data) {
	const summary = data;
	const advances = data.advances || [];

	// Build advances table
	let advancesHtml = '';
	if (advances.length > 0) {
		advancesHtml = `
			<table class="table table-bordered" style="font-size: 12px;">
				<thead>
					<tr>
						<th>Advance #</th>
						<th>Date</th>
						<th>BOQ Item</th>
						<th class="text-right">Amount</th>
						<th class="text-right">Allocated</th>
						<th class="text-right">Unallocated</th>
						<th>Status</th>
						<th>Reference</th>
					</tr>
				</thead>
				<tbody>
					${advances.map(adv => `
						<tr>
							<td><a href="/app/boq-advance-payment/${adv.name}">${adv.name}</a></td>
							<td>${adv.date}</td>
							<td>${adv.boq_item || '-'}</td>
							<td class="text-right">${format_currency(adv.amount)}</td>
							<td class="text-right">${format_currency(adv.allocated_amount)}</td>
							<td class="text-right">${format_currency(adv.unallocated_amount)}</td>
							<td><span class="indicator-pill ${get_advance_status_color(adv.status)}">${adv.status}</span></td>
							<td>${adv.reference || '-'}</td>
						</tr>
					`).join('')}
				</tbody>
			</table>
		`;
	} else {
		advancesHtml = '<p class="text-muted text-center">No advances recorded for this bill</p>';
	}

	const d = new frappe.ui.Dialog({
		title: __('Advances - {0}', [bill_no]),
		size: 'large',
		fields: [
			{
				fieldtype: 'HTML',
				fieldname: 'content',
				options: `
					<style>
						.advance-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
						.advance-summary-card { background: #f8f9fa; padding: 16px; border-radius: 8px; text-align: center; }
						.advance-summary-card.total { background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: white; }
						.advance-summary-card.allocated { background: #d1fae5; }
						.advance-summary-card.unallocated { background: #fef3c7; }
						.advance-summary-label { font-size: 10px; text-transform: uppercase; opacity: 0.8; margin-bottom: 4px; }
						.advance-summary-value { font-size: 20px; font-weight: 600; }
						.indicator-pill { padding: 2px 8px; border-radius: 10px; font-size: 11px; }
						.indicator-pill.green { background: #d1fae5; color: #065f46; }
						.indicator-pill.blue { background: #dbeafe; color: #1e40af; }
						.indicator-pill.orange { background: #fef3c7; color: #92400e; }
						.indicator-pill.gray { background: #f3f4f6; color: #4b5563; }
					</style>
					<div class="advance-summary">
						<div class="advance-summary-card">
							<div class="advance-summary-label">Count</div>
							<div class="advance-summary-value">${summary.count || 0}</div>
						</div>
						<div class="advance-summary-card total">
							<div class="advance-summary-label">Total Advances</div>
							<div class="advance-summary-value">${format_currency(summary.total_advances)}</div>
						</div>
						<div class="advance-summary-card allocated">
							<div class="advance-summary-label">Allocated</div>
							<div class="advance-summary-value">${format_currency(summary.allocated)}</div>
						</div>
						<div class="advance-summary-card unallocated">
							<div class="advance-summary-label">Unallocated</div>
							<div class="advance-summary-value">${format_currency(summary.unallocated)}</div>
						</div>
					</div>
					<div class="advances-table-wrapper">
						${advancesHtml}
					</div>
				`
			}
		]
	});

	// Fix: Ensure proper cleanup when dialog is closed
	d.onhide = function () {
		cleanup_modal_and_restore_dashboard();
	};
	d.show();
	ensure_dashboard_visible();
}

function get_advance_status_color(status) {
	switch (status) {
		case 'Fully Utilized': return 'green';
		case 'Partially Utilized': return 'blue';
		case 'Active': return 'orange';
		default: return 'gray';
	}
}

window.generate_invoice_for_all = function (project) {
	// Get ALL bills and items (not just those with current_qty > 0)
	frappe.call({
		method: 'construction_management.api.boq_invoice.get_all_bills_with_items',
		args: { project: project },
		callback: function (r) {
			if (r.message && r.message.length > 0) {
				show_invoice_selection_dialog(project, r.message);
			} else {
				frappe.show_alert({ message: __('No items with balance to bill'), indicator: 'orange' });
			}
		}
	});
};

function show_invoice_selection_dialog(project, billsWithItems) {
	// Build bill and items HTML - items are NOT selected by default
	let billsHtml = billsWithItems.map(bill => `
		<div class="bill-section collapsed" data-bill="${bill.bill_name}">
			<div class="bill-header-row" onclick="toggleBillItems(this)">
				<div class="bill-header-left">
					<input type="checkbox" class="bill-checkbox" data-bill="${bill.bill_name}" onclick="event.stopPropagation();">
					<svg class="chevron-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
					<span class="bill-no">${bill.bill_no}</span>
					${bill.bill_description ? `<span class="bill-desc">${bill.bill_description}</span>` : ''}
				</div>
				<div class="bill-header-right">
					<span class="bill-stat">${bill.item_count} items</span>
					<span class="bill-balance">Balance: ${format_currency(bill.total_balance)}</span>
					<span class="bill-amount" data-bill="${bill.bill_name}">To Bill: ${format_currency(0)}</span>
				</div>
			</div>
			<div class="bill-items" style="display: none;">
				<table class="items-table">
					<thead>
						<tr>
							<th style="width: 30px;"></th>
							<th>Description</th>
							<th style="width: 60px;">Unit</th>
							<th style="width: 80px;">Rate</th>
							<th style="width: 80px;">Billed</th>
							<th style="width: 80px;">Balance</th>
							<th style="width: 90px;">Bill Qty</th>
							<th style="width: 100px;">Amount</th>
						</tr>
					</thead>
					<tbody>
						${bill.items.map(item => `
							<tr class="item-row unchecked" data-item="${item.boq_item}">
								<td><input type="checkbox" class="item-checkbox" data-item="${item.boq_item}" data-bill="${bill.bill_name}"></td>
								<td class="item-desc">${item.description || item.item_code || 'No description'}</td>
								<td>${item.unit || '-'}</td>
								<td class="text-right">${format_currency(item.rate)}</td>
								<td class="text-right text-muted">${format_number(item.to_date_qty || 0)}</td>
								<td class="text-right text-success">${format_number(item.balance_qty)}</td>
								<td>
									<input type="number" class="item-qty-input form-control input-sm" 
										data-item="${item.boq_item}" 
										data-rate="${item.rate}"
										data-max="${item.balance_qty}"
										value="0" 
										min="0" max="${item.balance_qty}" step="0.001"
										style="width: 80px; text-align: right;">
								</td>
								<td class="text-right item-amount" data-item="${item.boq_item}">${format_currency(0)}</td>
							</tr>
						`).join('')}
					</tbody>
				</table>
			</div>
		</div>
	`).join('');

	const d = new frappe.ui.Dialog({
		title: __('Generate Invoice - Select Items'),
		size: 'extra-large',
		fields: [
			{
				fieldtype: 'HTML',
				fieldname: 'bill_selection',
				options: `
					<div class="invoice-selection-container">
						<div class="selection-header">
							<div class="selection-info">
								<span class="info-text">Select bills or individual items to invoice</span>
							</div>
							<div class="selection-summary">
								<span id="selected-count">0</span> items | 
								<span id="selected-amount">${format_currency(0)}</span>
							</div>
						</div>
						<div class="bills-container">
							${billsHtml}
						</div>
					</div>
					<style>
						.invoice-selection-container { max-height: 450px; overflow-y: auto; }
						.selection-header { 
							display: flex; justify-content: space-between; align-items: center;
							padding: 12px 16px; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
							border: 1px solid #bae6fd; border-radius: 8px; margin-bottom: 12px;
							position: sticky; top: 0; z-index: 10;
						}
						.info-text { font-size: 13px; color: #0369a1; }
						.selection-summary { font-size: 13px; color: #0369a1; font-weight: 600; }
						.bills-container { display: flex; flex-direction: column; gap: 8px; }
						.bill-section { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
						.bill-section.has-selection { border-color: #3b82f6; background: #f0f9ff; }
						.bill-header-row { 
							display: flex; justify-content: space-between; align-items: center;
							padding: 10px 12px; background: #f9fafb; cursor: pointer;
							border-bottom: 1px solid #e5e7eb;
						}
						.bill-header-row:hover { background: #f3f4f6; }
						.bill-header-left { display: flex; align-items: center; gap: 8px; }
						.bill-header-right { display: flex; align-items: center; gap: 16px; }
						.bill-no { font-weight: 600; color: #1f2937; }
						.bill-desc { font-size: 12px; color: #6b7280; }
						.bill-stat { font-size: 12px; color: #6b7280; }
						.bill-balance { font-size: 12px; color: #059669; }
						.bill-amount { font-weight: 600; color: #3b82f6; min-width: 100px; text-align: right; }
						.chevron-icon { transition: transform 0.2s; }
						.bill-section.collapsed .chevron-icon { transform: rotate(-90deg); }
						.bill-items { padding: 0; }
						.items-table { width: 100%; border-collapse: collapse; font-size: 12px; }
						.items-table th { background: #f3f4f6; padding: 8px; text-align: left; font-weight: 600; }
						.items-table td { padding: 8px; border-bottom: 1px solid #f3f4f6; }
						.item-row:hover { background: #f9fafb; }
						.item-row.unchecked { opacity: 0.6; }
						.item-row.unchecked .item-qty-input { background: #f3f4f6; }
						.item-desc { max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
						.item-qty-input { padding: 4px 6px; border: 1px solid #d1d5db; border-radius: 4px; }
						.item-qty-input:focus { border-color: #3b82f6; outline: none; }
						.text-right { text-align: right; }
						.text-muted { color: #9ca3af; }
						.text-success { color: #059669; font-weight: 500; }
					</style>
				`
			},
			{
				fieldtype: 'Section Break',
				label: __('Invoice Options')
			},
			{
				fieldtype: 'Check',
				fieldname: 'apply_retention',
				label: __('Apply Retention'),
				default: 1
			}
		],
		primary_action_label: __('Generate Proforma Invoice'),
		primary_action: function (values) {
			// Build items array from selected items with qty > 0
			const itemsToInvoice = [];
			d.$wrapper.find('.item-checkbox:checked').each(function () {
				const itemName = $(this).data('item');
				const qtyInput = d.$wrapper.find(`.item-qty-input[data-item="${itemName}"]`);
				const qty = parseFloat(qtyInput.val()) || 0;
				if (qty > 0) {
					itemsToInvoice.push({
						boq_item: itemName,
						qty: qty
					});
				}
			});

			if (itemsToInvoice.length === 0) {
				frappe.show_alert({ message: __('Please select at least one item and enter quantity to bill'), indicator: 'orange' });
				return;
			}

			d.disable_primary_action();

			// Create Proforma Invoice (not Sales Invoice)
			frappe.call({
				method: 'construction_management.construction_management.doctype.proforma_invoice.proforma_invoice.create_proforma_from_selected_items',
				args: {
					project: project,
					items: JSON.stringify(itemsToInvoice),
					apply_retention: values.apply_retention ? 1 : 0
				},
				callback: function (r) {
					d.enable_primary_action();
					if (r.message) {
						d.hide();
						frappe.show_alert({
							message: __('Proforma Invoice {0} created with {1} items', [
								r.message.name,
								r.message.item_count
							]),
							indicator: 'green'
						});
						frappe.set_route('Form', 'Proforma Invoice', r.message.name);
					}
				},
				error: function () {
					d.enable_primary_action();
				}
			});
		}
	});

	// Toggle bill items visibility
	window.toggleBillItems = function (header) {
		const section = $(header).closest('.bill-section');
		const items = section.find('.bill-items');
		section.toggleClass('collapsed');
		items.slideToggle(200);
	};

	// Update totals function
	function updateTotals() {
		let totalSelected = 0;
		let totalAmount = 0;

		d.$wrapper.find('.item-checkbox:checked').each(function () {
			const itemName = $(this).data('item');
			const qtyInput = d.$wrapper.find(`.item-qty-input[data-item="${itemName}"]`);
			const rate = parseFloat(qtyInput.data('rate')) || 0;
			const qty = parseFloat(qtyInput.val()) || 0;
			if (qty > 0) {
				totalSelected++;
				totalAmount += qty * rate;
			}
		});

		d.$wrapper.find('#selected-count').text(totalSelected);
		d.$wrapper.find('#selected-amount').text(format_currency(totalAmount));

		// Update bill totals and highlight bills with selections
		billsWithItems.forEach(bill => {
			let billTotal = 0;
			let hasSelection = false;
			bill.items.forEach(item => {
				const checkbox = d.$wrapper.find(`.item-checkbox[data-item="${item.boq_item}"]`);
				if (checkbox.is(':checked')) {
					const qtyInput = d.$wrapper.find(`.item-qty-input[data-item="${item.boq_item}"]`);
					const qty = parseFloat(qtyInput.val()) || 0;
					if (qty > 0) {
						billTotal += qty * item.rate;
						hasSelection = true;
					}
				}
			});
			d.$wrapper.find(`.bill-amount[data-bill="${bill.bill_name}"]`).text('To Bill: ' + format_currency(billTotal));
			d.$wrapper.find(`.bill-section[data-bill="${bill.bill_name}"]`).toggleClass('has-selection', hasSelection);
		});
	}

	// When bill checkbox is checked, select all items and set qty to balance
	d.$wrapper.on('change', '.bill-checkbox', function () {
		const billName = $(this).data('bill');
		const isChecked = $(this).is(':checked');
		const section = d.$wrapper.find(`.bill-section[data-bill="${billName}"]`);

		// Select/deselect all items in this bill
		section.find('.item-checkbox').prop('checked', isChecked);
		section.find('.item-row').toggleClass('unchecked', !isChecked);

		// If checking, set qty to balance for all items; if unchecking, set to 0
		section.find('.item-qty-input').each(function () {
			const maxQty = parseFloat($(this).data('max')) || 0;
			const newQty = isChecked ? maxQty : 0;
			$(this).val(newQty);

			// Update amount display
			const itemName = $(this).data('item');
			const rate = parseFloat($(this).data('rate')) || 0;
			d.$wrapper.find(`.item-amount[data-item="${itemName}"]`).text(format_currency(newQty * rate));
		});

		// Expand the bill section if checking
		if (isChecked && section.hasClass('collapsed')) {
			section.removeClass('collapsed');
			section.find('.bill-items').slideDown(200);
		}

		updateTotals();
	});

	// When item checkbox is changed
	d.$wrapper.on('change', '.item-checkbox', function () {
		const row = $(this).closest('.item-row');
		const isChecked = $(this).is(':checked');
		const itemName = $(this).data('item');
		const qtyInput = d.$wrapper.find(`.item-qty-input[data-item="${itemName}"]`);

		row.toggleClass('unchecked', !isChecked);

		// If checking, set qty to balance; if unchecking, set to 0
		if (isChecked) {
			const maxQty = parseFloat(qtyInput.data('max')) || 0;
			qtyInput.val(maxQty);
			const rate = parseFloat(qtyInput.data('rate')) || 0;
			d.$wrapper.find(`.item-amount[data-item="${itemName}"]`).text(format_currency(maxQty * rate));
		} else {
			qtyInput.val(0);
			d.$wrapper.find(`.item-amount[data-item="${itemName}"]`).text(format_currency(0));
		}

		// Update bill checkbox state
		const billName = $(this).data('bill');
		const billItems = d.$wrapper.find(`.item-checkbox[data-bill="${billName}"]`);
		const checkedItems = billItems.filter(':checked');
		d.$wrapper.find(`.bill-checkbox[data-bill="${billName}"]`).prop('checked', checkedItems.length === billItems.length);
		d.$wrapper.find(`.bill-checkbox[data-bill="${billName}"]`).prop('indeterminate', checkedItems.length > 0 && checkedItems.length < billItems.length);

		updateTotals();
	});

	// When qty input changes
	d.$wrapper.on('change input', '.item-qty-input', function () {
		const itemName = $(this).data('item');
		const rate = parseFloat($(this).data('rate')) || 0;
		const maxQty = parseFloat($(this).data('max')) || 0;
		let qty = parseFloat($(this).val()) || 0;

		// Validate qty
		if (qty < 0) { qty = 0; $(this).val(0); }
		if (qty > maxQty) {
			qty = maxQty;
			$(this).val(maxQty);
			frappe.show_alert({ message: __('Quantity cannot exceed balance ({0})', [maxQty]), indicator: 'orange' });
		}

		// Update amount display
		const amount = qty * rate;
		d.$wrapper.find(`.item-amount[data-item="${itemName}"]`).text(format_currency(amount));

		// Auto-check the item if qty > 0
		const checkbox = d.$wrapper.find(`.item-checkbox[data-item="${itemName}"]`);
		if (qty > 0 && !checkbox.is(':checked')) {
			checkbox.prop('checked', true);
			$(this).closest('.item-row').removeClass('unchecked');
		} else if (qty === 0 && checkbox.is(':checked')) {
			checkbox.prop('checked', false);
			$(this).closest('.item-row').addClass('unchecked');
		}

		// Update bill checkbox state
		const billName = checkbox.data('bill');
		const billItems = d.$wrapper.find(`.item-checkbox[data-bill="${billName}"]`);
		const checkedItems = billItems.filter(':checked');
		d.$wrapper.find(`.bill-checkbox[data-bill="${billName}"]`).prop('checked', checkedItems.length === billItems.length);
		d.$wrapper.find(`.bill-checkbox[data-bill="${billName}"]`).prop('indeterminate', checkedItems.length > 0 && checkedItems.length < billItems.length);

		updateTotals();
	});

	d.onhide = function () {
		cleanup_modal_and_restore_dashboard();
	};

	d.show();
}

// Keep the old function for backward compatibility
function show_bill_selection_dialog(project, bills) {
	// Build bill selection HTML
	let billsHtml = bills.map(bill => `
		<div class="bill-select-row" data-bill="${bill.name}">
			<label class="bill-checkbox-label">
				<input type="checkbox" class="bill-checkbox" data-bill="${bill.name}" checked>
				<div class="bill-info">
					<span class="bill-no">${bill.bill_no}</span>
					${bill.description ? `<span class="bill-desc">${bill.description}</span>` : ''}
				</div>
				<div class="bill-stats">
					<span class="stat-item"><strong>${bill.item_count}</strong> items</span>
					<span class="stat-item"><strong>${format_currency(bill.total_amount)}</strong></span>
				</div>
			</label>
		</div>
	`).join('');

	const totalAmount = bills.reduce((sum, b) => sum + (b.total_amount || 0), 0);
	const totalItems = bills.reduce((sum, b) => sum + (b.item_count || 0), 0);

	const d = new frappe.ui.Dialog({
		title: __('Generate Invoice for Selected Bills'),
		size: 'large',
		fields: [
			{
				fieldtype: 'HTML',
				fieldname: 'bill_selection',
				options: `
					<div class="bill-selection-container">
						<div class="selection-header">
							<label class="select-all-label">
								<input type="checkbox" id="select-all-bills" checked>
								<span>Select All Bills</span>
							</label>
							<div class="selection-summary">
								<span id="selected-count">${bills.length}</span> bills selected | 
								<span id="selected-items">${totalItems}</span> items | 
								<span id="selected-amount">${format_currency(totalAmount)}</span>
							</div>
						</div>
						<div class="bills-list">
							${billsHtml}
						</div>
					</div>
					<style>
						.bill-selection-container { max-height: 400px; overflow-y: auto; }
						.selection-header { 
							display: flex; 
							justify-content: space-between; 
							align-items: center;
							padding: 12px 16px;
							background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
							border: 1px solid #bae6fd;
							border-radius: 8px;
							margin-bottom: 12px;
						}
						.select-all-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600; }
						.selection-summary { font-size: 13px; color: #0369a1; }
						.bills-list { display: flex; flex-direction: column; gap: 8px; }
						.bill-select-row { 
							border: 1px solid #e5e7eb; 
							border-radius: 8px; 
							transition: all 0.2s;
						}
						.bill-select-row:hover { border-color: #3b82f6; background: #f8fafc; }
						.bill-select-row.selected { border-color: #3b82f6; background: #eff6ff; }
						.bill-checkbox-label { 
							display: flex; 
							align-items: center; 
							padding: 12px 16px; 
							cursor: pointer;
							gap: 12px;
						}
						.bill-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
						.bill-no { font-weight: 600; color: #1f2937; }
						.bill-desc { font-size: 12px; color: #6b7280; }
						.bill-stats { display: flex; gap: 16px; font-size: 13px; color: #374151; }
						.stat-item { display: flex; gap: 4px; }
					</style>
				`
			},
			{
				fieldtype: 'Section Break',
				label: __('Invoice Options')
			},
			{
				fieldtype: 'Check',
				fieldname: 'apply_retention',
				label: __('Apply Retention'),
				default: 1
			},
			{
				fieldtype: 'Column Break'
			},
			{
				fieldtype: 'Check',
				fieldname: 'is_proforma',
				label: __('Create as Proforma Invoice'),
				default: 0
			},
			{
				fieldtype: 'Section Break'
			},
			{
				fieldtype: 'Currency',
				fieldname: 'advance_deduction',
				label: __('Advance Deduction'),
				default: 0
			}
		],
		primary_action_label: __('Generate Invoice'),
		primary_action: function (values) {
			const selectedBills = [];
			d.$wrapper.find('.bill-checkbox:checked').each(function () {
				selectedBills.push($(this).data('bill'));
			});

			if (selectedBills.length === 0) {
				frappe.show_alert({ message: __('Please select at least one bill'), indicator: 'orange' });
				return;
			}

			d.disable_primary_action();

			frappe.call({
				method: 'construction_management.api.boq_invoice.create_invoice_from_selected_bills',
				args: {
					project: project,
					bill_names: selectedBills,
					apply_retention: values.apply_retention ? 1 : 0,
					advance_deduction: values.advance_deduction || 0,
					is_proforma: values.is_proforma ? 1 : 0
				},
				callback: function (r) {
					d.enable_primary_action();
					if (r.message) {
						d.hide();
						frappe.show_alert({
							message: __('Invoice {0} created with {1} items from {2} bills', [
								r.message.invoice,
								r.message.item_count,
								r.message.bills_included.length
							]),
							indicator: 'green'
						});
						frappe.set_route('Form', 'Sales Invoice', r.message.invoice);
					}
				},
				error: function () {
					d.enable_primary_action();
				}
			});
		}
	});

	// Set up event handlers after dialog is shown
	d.$wrapper.on('change', '#select-all-bills', function () {
		const isChecked = $(this).is(':checked');
		d.$wrapper.find('.bill-checkbox').prop('checked', isChecked);
		d.$wrapper.find('.bill-select-row').toggleClass('selected', isChecked);
		updateSelectionSummary();
	});

	d.$wrapper.on('change', '.bill-checkbox', function () {
		const row = $(this).closest('.bill-select-row');
		row.toggleClass('selected', $(this).is(':checked'));

		// Update select all checkbox
		const allChecked = d.$wrapper.find('.bill-checkbox').length === d.$wrapper.find('.bill-checkbox:checked').length;
		d.$wrapper.find('#select-all-bills').prop('checked', allChecked);

		updateSelectionSummary();
	});

	function updateSelectionSummary() {
		let selectedCount = 0;
		let selectedItems = 0;
		let selectedAmount = 0;

		d.$wrapper.find('.bill-checkbox:checked').each(function () {
			const billName = $(this).data('bill');
			const bill = bills.find(b => b.name === billName);
			if (bill) {
				selectedCount++;
				selectedItems += bill.item_count || 0;
				selectedAmount += bill.total_amount || 0;
			}
		});

		d.$wrapper.find('#selected-count').text(selectedCount);
		d.$wrapper.find('#selected-items').text(selectedItems);
		d.$wrapper.find('#selected-amount').text(format_currency(selectedAmount));
	}

	d.onhide = function () {
		cleanup_modal_and_restore_dashboard();
	};

	d.show();

	// Mark all rows as selected initially
	d.$wrapper.find('.bill-select-row').addClass('selected');
}

window.export_boq_excel = function (project) {
	frappe.call({
		method: 'construction_management.api.boq_excel.export_boq_to_excel',
		args: { project: project },
		callback: function (r) {
			if (r.message) { window.open(r.message); frappe.show_alert({ message: __('Excel exported'), indicator: 'green' }); }
		}
	});
};

window.view_all_dprs = function (project) {
	frappe.call({
		method: 'construction_management.api.dpr_utils.get_project_dprs',
		args: { project: project },
		callback: function (r) {
			if (r.message) {
				show_dprs_dialog(project, r.message);
			} else {
				frappe.msgprint(__('No Daily Progress Records found for this project.'));
			}
		}
	});
};

// ============================================
// Gantt Chart View (Task 7.3-7.4)
// ============================================

window.view_gantt_chart = function (project) {
	frappe.call({
		method: 'construction_management.api.gantt.get_boq_gantt_data',
		args: { project: project },
		callback: function (r) {
			if (r.message && r.message.length > 0) {
				show_gantt_chart_dialog(project, r.message);
			} else {
				frappe.msgprint({
					title: __('No Tasks Found'),
					message: __('No BOQ Items marked as tasks with dates found. To show items on the Gantt chart:<br><br>1. Edit BOQ Items<br>2. Enable "Is Task" checkbox<br>3. Set Start Date and End Date'),
					indicator: 'orange'
				});
			}
		}
	});
};

function show_gantt_chart_dialog(project, tasks) {
	const d = new frappe.ui.Dialog({
		title: __('Gantt Chart - {0}', [project]),
		size: 'extra-large',
		fields: [
			{
				fieldtype: 'HTML',
				fieldname: 'gantt_container',
				options: `
					<style>
						.gantt-wrapper { padding: 20px; background: #fff; min-height: 400px; }
						.gantt-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
						.gantt-header h4 { margin: 0; color: #374151; }
						.gantt-legend { display: flex; gap: 16px; font-size: 12px; }
						.gantt-legend-item { display: flex; align-items: center; gap: 6px; }
						.gantt-legend-color { width: 16px; height: 16px; border-radius: 4px; }
						.gantt-controls { display: flex; gap: 8px; margin-bottom: 16px; }
						.gantt-controls button { padding: 6px 12px; border: 1px solid #d1d5db; border-radius: 4px; background: white; cursor: pointer; font-size: 12px; }
						.gantt-controls button:hover { background: #f3f4f6; }
						.gantt-controls button.active { background: #8b5cf6; color: white; border-color: #8b5cf6; }
						#gantt-chart-container { border: 1px solid #e5e7eb; border-radius: 8px; overflow: auto; }
						.gantt-task-row { display: flex; align-items: center; padding: 8px 12px; border-bottom: 1px solid #f3f4f6; }
						.gantt-task-row:hover { background: #f9fafb; }
						.gantt-task-name { flex: 1; font-size: 13px; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px; }
						.gantt-task-dates { font-size: 11px; color: #6b7280; width: 180px; text-align: center; }
						.gantt-task-bar-container { flex: 2; min-width: 300px; }
						.gantt-task-bar { height: 24px; border-radius: 4px; position: relative; }
						.gantt-task-progress { height: 100%; border-radius: 4px; opacity: 0.7; }
						.gantt-task-bar.gantt-completed { background: #10b981; }
						.gantt-task-bar.gantt-near-complete { background: #34d399; }
						.gantt-task-bar.gantt-half-done { background: #fbbf24; }
						.gantt-task-bar.gantt-started { background: #60a5fa; }
						.gantt-task-bar.gantt-not-started { background: #9ca3af; }
						.gantt-empty { text-align: center; padding: 60px 20px; color: #9ca3af; }
						.gantt-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
						.gantt-stat { background: #f9fafb; padding: 12px; border-radius: 8px; text-align: center; }
						.gantt-stat-value { font-size: 24px; font-weight: 600; color: #8b5cf6; }
						.gantt-stat-label { font-size: 11px; color: #6b7280; text-transform: uppercase; margin-top: 4px; }
					</style>
					<div class="gantt-wrapper">
						<div class="gantt-header">
							<h4>📊 Project Tasks Timeline</h4>
							<div class="gantt-legend">
								<div class="gantt-legend-item"><div class="gantt-legend-color" style="background: #10b981;"></div> Completed (100%)</div>
								<div class="gantt-legend-item"><div class="gantt-legend-color" style="background: #fbbf24;"></div> In Progress</div>
								<div class="gantt-legend-item"><div class="gantt-legend-color" style="background: #9ca3af;"></div> Not Started</div>
							</div>
						</div>
						<div class="gantt-stats" id="gantt-stats"></div>
						<div id="gantt-chart-container"></div>
					</div>
				`
			}
		]
	});

	// Fix: Ensure proper cleanup when dialog is closed
	d.onhide = function () {
		cleanup_modal_and_restore_dashboard();
	};
	d.show();

	// Render Gantt chart after dialog shows
	setTimeout(() => {
		render_gantt_chart(tasks);
	}, 100);
}

function render_gantt_chart(tasks) {
	// Calculate stats
	const total = tasks.length;
	const completed = tasks.filter(t => t.progress >= 100).length;
	const inProgress = tasks.filter(t => t.progress > 0 && t.progress < 100).length;
	const notStarted = tasks.filter(t => t.progress === 0).length;

	// Render stats
	$('#gantt-stats').html(`
		<div class="gantt-stat">
			<div class="gantt-stat-value">${total}</div>
			<div class="gantt-stat-label">Total Tasks</div>
		</div>
		<div class="gantt-stat">
			<div class="gantt-stat-value" style="color: #10b981;">${completed}</div>
			<div class="gantt-stat-label">Completed</div>
		</div>
		<div class="gantt-stat">
			<div class="gantt-stat-value" style="color: #fbbf24;">${inProgress}</div>
			<div class="gantt-stat-label">In Progress</div>
		</div>
		<div class="gantt-stat">
			<div class="gantt-stat-value" style="color: #9ca3af;">${notStarted}</div>
			<div class="gantt-stat-label">Not Started</div>
		</div>
	`);

	// Find date range
	let minDate = null, maxDate = null;
	tasks.forEach(task => {
		const start = new Date(task.start);
		const end = new Date(task.end);
		if (!minDate || start < minDate) minDate = start;
		if (!maxDate || end > maxDate) maxDate = end;
	});

	if (!minDate || !maxDate) {
		$('#gantt-chart-container').html('<div class="gantt-empty">No valid date range found</div>');
		return;
	}

	const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1;

	// Render task rows
	let html = '';
	tasks.forEach(task => {
		const start = new Date(task.start);
		const end = new Date(task.end);
		const startOffset = Math.ceil((start - minDate) / (1000 * 60 * 60 * 24));
		const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
		const widthPercent = (duration / totalDays) * 100;
		const leftPercent = (startOffset / totalDays) * 100;

		html += `
			<div class="gantt-task-row" data-task-id="${task.id}">
				<div class="gantt-task-name" title="${task.name}">${task.name}</div>
				<div class="gantt-task-dates">${task.start} → ${task.end}</div>
				<div class="gantt-task-bar-container">
					<div class="gantt-task-bar ${task.custom_class}" style="width: ${widthPercent}%; margin-left: ${leftPercent}%;">
						<div class="gantt-task-progress" style="width: ${task.progress}%;"></div>
					</div>
				</div>
			</div>
		`;
	});

	$('#gantt-chart-container').html(html || '<div class="gantt-empty">No tasks to display</div>');

	// Add click handler to open BOQ Item
	$('.gantt-task-row').on('click', function () {
		const taskId = $(this).data('task-id');
		if (taskId) {
			frappe.set_route('Form', 'BOQ Item', taskId);
		}
	});
}

function show_dprs_dialog(project, dprs) {
	// Calculate totals including quantities (Task 3.3: Display Quantities in DPR Totals)
	const totals = {
		labour: 0, material: 0, asset: 0, subcontract: 0, expense: 0, overhead: 0, total: 0,
		// Quantity totals
		labour_hours: 0, material_qty: 0, asset_hours: 0, subcontract_qty: 0, expense_count: 0
	};
	dprs.forEach(dpr => {
		if (dpr.docstatus === 1) { // Only count submitted
			totals.labour += flt(dpr.labour_cost);
			totals.material += flt(dpr.material_cost);
			totals.asset += flt(dpr.asset_cost);
			totals.subcontract += flt(dpr.subcontract_cost);
			totals.expense += flt(dpr.expense_cost);
			totals.overhead += flt(dpr.overhead_cost);
			totals.total += flt(dpr.total_cost);
			// Quantity totals
			totals.labour_hours += flt(dpr.total_labour_hours);
			totals.material_qty += flt(dpr.total_material_qty);
			totals.asset_hours += flt(dpr.total_asset_hours);
			totals.subcontract_qty += flt(dpr.total_subcontract_qty);
			totals.expense_count += flt(dpr.total_expense_count);
		}
	});

	// Format quantity with unit display
	const formatQtyAmt = (qty, unit, amt) => {
		const qtyStr = qty > 0 ? `<span class="qty-display">${flt(qty, 2)} ${unit}</span> | ` : '';
		return `${qtyStr}${format_currency(amt)}`;
	};

	// Build table rows
	let tableRows = dprs.length > 0 ? dprs.map((dpr, idx) => {
		const statusClass = dpr.status === 'Submitted' ? 'status-success' :
			(dpr.status === 'Draft' ? 'status-warning' : 'status-default');
		const dprLink = `<a href="/app/daily-progress-record/${dpr.name}" class="dpr-link">${dpr.name}</a>`;
		const boqDesc = dpr.boq_item_description ? dpr.boq_item_description.substring(0, 40) + (dpr.boq_item_description.length > 40 ? '...' : '') : '-';

		return `
		<tr>
			<td class="text-center">${idx + 1}</td>
			<td>${dprLink}</td>
			<td>${dpr.date}</td>
			<td>${dpr.bill_no || '-'}</td>
			<td title="${dpr.boq_item_description || ''}">${boqDesc}</td>
			<td class="text-right">${format_currency(dpr.labour_cost)}</td>
			<td class="text-right">${format_currency(dpr.material_cost)}</td>
			<td class="text-right">${format_currency(dpr.asset_cost)}</td>
			<td class="text-right">${format_currency(dpr.subcontract_cost)}</td>
			<td class="text-right">${format_currency(dpr.expense_cost)}</td>
			<td class="text-right">${format_currency(dpr.overhead_cost)}</td>
			<td class="text-right font-bold">${format_currency(dpr.total_cost)}</td>
			<td><span class="status-pill ${statusClass}">${dpr.status}</span></td>
		</tr>
		`;
	}).join('') : '<tr><td colspan="13" class="text-center text-muted">No DPR entries found</td></tr>';

	const d = new frappe.ui.Dialog({
		title: __('Daily Progress Records - {0}', [project]),
		size: 'extra-large',
		fields: [{ fieldtype: 'HTML', fieldname: 'dprs_html' }]
	});

	d.fields_dict.dprs_html.$wrapper.html(`
		<style>
			.qty-display { font-size: 0.85em; color: #6366f1; font-weight: 500; }
			.summary-card .summary-value { display: flex; flex-direction: column; align-items: flex-end; }
		</style>
		<div class="dprs-summary-grid">
			<div class="summary-card"><span class="summary-label">Total DPRs</span><span class="summary-value">${dprs.length}</span></div>
			<div class="summary-card labour"><span class="summary-label">Labour</span><span class="summary-value">${formatQtyAmt(totals.labour_hours, 'hrs', totals.labour)}</span></div>
			<div class="summary-card material"><span class="summary-label">Material</span><span class="summary-value">${formatQtyAmt(totals.material_qty, 'units', totals.material)}</span></div>
			<div class="summary-card asset"><span class="summary-label">Asset</span><span class="summary-value">${formatQtyAmt(totals.asset_hours, 'hrs', totals.asset)}</span></div>
			<div class="summary-card subcontract"><span class="summary-label">Subcontract</span><span class="summary-value">${formatQtyAmt(totals.subcontract_qty, 'items', totals.subcontract)}</span></div>
			<div class="summary-card expense"><span class="summary-label">Expense</span><span class="summary-value">${formatQtyAmt(totals.expense_count, 'items', totals.expense)}</span></div>
			<div class="summary-card overhead"><span class="summary-label">Overhead</span><span class="summary-value">${format_currency(totals.overhead)}</span></div>
			<div class="summary-card total"><span class="summary-label">Total Cost</span><span class="summary-value">${format_currency(totals.total)}</span></div>
		</div>
		<div class="dprs-table-wrapper">
			<table class="dprs-table">
				<thead>
					<tr>
						<th class="text-center">#</th>
						<th>DPR</th>
						<th>Date</th>
						<th>Bill No</th>
						<th>BOQ Item</th>
						<th class="text-right">Labour</th>
						<th class="text-right">Material</th>
						<th class="text-right">Asset</th>
						<th class="text-right">S/C</th>
						<th class="text-right">Expense</th>
						<th class="text-right">Overhead</th>
						<th class="text-right">Total</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>${tableRows}</tbody>
			</table>
		</div>
		<style>
			.dprs-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; margin-bottom: 20px; }
			.dprs-summary-grid .summary-card { background: #f8f9fa; border-radius: 8px; padding: 12px; text-align: center; }
			.dprs-summary-grid .summary-card.labour { background: #dbeafe; }
			.dprs-summary-grid .summary-card.material { background: #fef3c7; }
			.dprs-summary-grid .summary-card.asset { background: #e0e7ff; }
			.dprs-summary-grid .summary-card.subcontract { background: #d1fae5; }
			.dprs-summary-grid .summary-card.expense { background: #fce7f3; }
			.dprs-summary-grid .summary-card.overhead { background: #f3e8ff; }
			.dprs-summary-grid .summary-card.total { background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; }
			.dprs-summary-grid .summary-label { display: block; font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px; }
			.dprs-summary-grid .summary-card.total .summary-label { color: rgba(255,255,255,0.8); }
			.dprs-summary-grid .summary-value { display: block; font-size: 14px; font-weight: 600; }
			.dprs-table-wrapper { overflow-x: auto; max-height: 400px; overflow-y: auto; }
			.dprs-table { width: 100%; border-collapse: collapse; font-size: 12px; }
			.dprs-table th, .dprs-table td { padding: 8px 6px; border-bottom: 1px solid #e9ecef; white-space: nowrap; }
			.dprs-table th { background: #f8f9fa; font-weight: 500; font-size: 10px; text-transform: uppercase; position: sticky; top: 0; z-index: 1; }
			.dprs-table tbody tr:hover { background: #f8fafc; }
			.dpr-link { color: #5e64ff; text-decoration: none; font-weight: 500; }
			.dpr-link:hover { text-decoration: underline; }
			.font-bold { font-weight: 600; }
			.status-pill { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 500; }
			.status-success { background: #d1fae5; color: #065f46; }
			.status-warning { background: #fef3c7; color: #92400e; }
			.status-default { background: #f3f4f6; color: #6b7280; }
		</style>
	`);

	// Fix: Ensure proper cleanup when dialog is closed
	d.onhide = function () {
		cleanup_modal_and_restore_dashboard();
	};
	d.show();
	ensure_dashboard_visible();
}

window.print_invoice_till_date = function (project) {
	frappe.call({
		method: 'construction_management.api.boq_invoice.print_consolidated_invoice',
		args: { project: project, invoice_type: 'till_date' },
		callback: function (r) {
			if (r.message) {
				const printWindow = window.open('', '_blank');
				printWindow.document.write(r.message);
				printWindow.document.close();
				printWindow.focus();
				setTimeout(() => printWindow.print(), 500);
			}
		}
	});
};

window.print_monthly_invoice = function (project) {
	const currentDate = new Date();
	const currentMonth = currentDate.getMonth() + 1;
	const currentYear = currentDate.getFullYear();

	const d = new frappe.ui.Dialog({
		title: 'Monthly Invoice',
		fields: [
			{
				fieldname: 'month',
				label: 'Month',
				fieldtype: 'Select',
				options: [
					{ value: '1', label: 'January' },
					{ value: '2', label: 'February' },
					{ value: '3', label: 'March' },
					{ value: '4', label: 'April' },
					{ value: '5', label: 'May' },
					{ value: '6', label: 'June' },
					{ value: '7', label: 'July' },
					{ value: '8', label: 'August' },
					{ value: '9', label: 'September' },
					{ value: '10', label: 'October' },
					{ value: '11', label: 'November' },
					{ value: '12', label: 'December' }
				],
				default: currentMonth.toString(),
				reqd: 1
			},
			{
				fieldname: 'year',
				label: 'Year',
				fieldtype: 'Int',
				default: currentYear,
				reqd: 1
			}
		],
		primary_action_label: 'Print',
		primary_action(values) {
			d.hide();
			frappe.call({
				method: 'construction_management.api.boq_invoice.print_consolidated_invoice',
				args: {
					project: project,
					invoice_type: 'monthly',
					month: values.month,
					year: values.year
				},
				callback: function (r) {
					if (r.message) {
						const printWindow = window.open('', '_blank');
						printWindow.document.write(r.message);
						printWindow.document.close();
						printWindow.focus();
						setTimeout(() => printWindow.print(), 500);
					}
				}
			});
		}
	});
	d.show();
};

window.record_advance_payment = function (project) {
	const d = new frappe.ui.Dialog({
		title: 'Record Advance Payment',
		fields: [
			{
				fieldname: 'bill_no',
				label: 'Bill No',
				fieldtype: 'Link',
				options: 'BOQ Bill',
				get_query: function () {
					return {
						filters: {
							project: project
						}
					};
				},
				description: 'Optional: Link advance to a specific bill'
			},
			{
				fieldname: 'boq_item',
				label: 'BOQ Item',
				fieldtype: 'Link',
				options: 'BOQ Item',
				depends_on: 'bill_no',
				get_query: function () {
					return {
						filters: {
							parent_bill: d.get_value('bill_no')
						}
					};
				},
				description: 'Optional: Link advance to a specific BOQ item'
			},
			{ fieldtype: 'Section Break' },
			{ fieldname: 'amount', label: 'Amount', fieldtype: 'Currency', reqd: 1 },
			{ fieldname: 'date', label: 'Date', fieldtype: 'Date', default: frappe.datetime.get_today(), reqd: 1 },
			{ fieldtype: 'Column Break' },
			{ fieldname: 'reference', label: 'Reference', fieldtype: 'Data', description: 'Payment reference or receipt number' },
			{ fieldname: 'remarks', label: 'Remarks', fieldtype: 'Small Text' }
		],
		primary_action_label: 'Record',
		primary_action(values) {
			frappe.call({
				method: 'frappe.client.insert',
				args: {
					doc: {
						doctype: 'BOQ Advance Payment',
						project: project,
						bill_no: values.bill_no || null,
						boq_item: values.boq_item || null,
						amount: values.amount,
						date: values.date,
						reference: values.reference,
						remarks: values.remarks
					}
				},
				callback: function (r) {
					if (r.message) {
						d.hide();
						frappe.show_alert({ message: __('Advance payment recorded'), indicator: 'green' });
						// Submit the advance payment
						frappe.call({
							method: 'frappe.client.submit',
							args: { doc: r.message },
							callback: function () {
								cur_frm.reload_doc();
							}
						});
					}
				}
			});
		}
	});
	d.show();
};

// ============================================
// Payment Certificate Functions
// ============================================

window.view_payment_certificates = function (project) {
	// Fetch pending proformas and existing payment certificates
	frappe.call({
		method: 'construction_management.construction_management.doctype.payment_certificate.payment_certificate.get_pending_proformas',
		args: { project: project },
		callback: function (proformaRes) {
			frappe.call({
				method: 'frappe.client.get_list',
				args: {
					doctype: 'Payment Certificate',
					filters: { project: project },
					fields: ['name', 'posting_date', 'proforma_amount', 'accepted_amount', 'variance', 'status', 'tax_invoice'],
					order_by: 'posting_date desc',
					limit_page_length: 50
				},
				callback: function (pcRes) {
					show_payment_certificates_dialog(project, proformaRes.message || [], pcRes.message || []);
				}
			});
		}
	});
};

function show_payment_certificates_dialog(project, pendingProformas, paymentCertificates) {
	// Build pending proformas table
	let proformasHtml = '';
	if (pendingProformas.length > 0) {
		proformasHtml = `
			<table class="table table-bordered" style="font-size: 12px;">
				<thead>
					<tr>
						<th>Invoice</th>
						<th>Date</th>
						<th>Customer</th>
						<th class="text-right">Amount</th>
						<th class="text-center">Age (Days)</th>
						<th>Action</th>
					</tr>
				</thead>
				<tbody>
					${pendingProformas.map(p => `
						<tr>
							<td><a href="/app/sales-invoice/${p.name}">${p.name}</a></td>
							<td>${p.posting_date}</td>
							<td>${p.customer_name || p.customer || '-'}</td>
							<td class="text-right">${format_currency(p.grand_total)}</td>
							<td class="text-center">${p.age_days || 0}</td>
							<td>
								<button class="btn btn-xs btn-primary" onclick="create_payment_certificate_from_dialog('${p.name}', ${p.grand_total}, '${project}')">
									Create PC
								</button>
							</td>
						</tr>
					`).join('')}
				</tbody>
			</table>
		`;
	} else {
		proformasHtml = '<p class="text-muted">No pending proforma invoices</p>';
	}

	// Build payment certificates table
	let pcsHtml = '';
	if (paymentCertificates.length > 0) {
		pcsHtml = `
			<table class="table table-bordered" style="font-size: 12px;">
				<thead>
					<tr>
						<th>PC #</th>
						<th>Date</th>
						<th class="text-right">Proforma</th>
						<th class="text-right">Accepted</th>
						<th class="text-right">Variance</th>
						<th>Status</th>
						<th>Tax Invoice</th>
					</tr>
				</thead>
				<tbody>
					${paymentCertificates.map(pc => `
						<tr>
							<td><a href="/app/payment-certificate/${pc.name}">${pc.name}</a></td>
							<td>${pc.posting_date}</td>
							<td class="text-right">${format_currency(pc.proforma_amount)}</td>
							<td class="text-right">${format_currency(pc.accepted_amount)}</td>
							<td class="text-right ${pc.variance > 0 ? 'text-danger' : ''}">${format_currency(pc.variance)}</td>
							<td><span class="indicator-pill ${get_pc_status_color(pc.status)}">${pc.status}</span></td>
							<td>${pc.tax_invoice ? `<a href="/app/sales-invoice/${pc.tax_invoice}">${pc.tax_invoice}</a>` : '-'}</td>
						</tr>
					`).join('')}
				</tbody>
			</table>
		`;
	} else {
		pcsHtml = '<p class="text-muted">No payment certificates yet</p>';
	}

	const d = new frappe.ui.Dialog({
		title: __('Payment Certificates - {0}', [project]),
		size: 'extra-large',
		fields: [
			{
				fieldtype: 'HTML',
				fieldname: 'content',
				options: `
					<style>
						.pc-tabs { display: flex; border-bottom: 1px solid #d1d5db; margin-bottom: 16px; }
						.pc-tab { padding: 10px 20px; cursor: pointer; border-bottom: 2px solid transparent; }
						.pc-tab.active { border-bottom-color: #5e64ff; color: #5e64ff; font-weight: 500; }
						.pc-tab-content { display: none; }
						.pc-tab-content.active { display: block; }
						.indicator-pill { padding: 2px 8px; border-radius: 10px; font-size: 11px; }
						.indicator-pill.green { background: #d1fae5; color: #065f46; }
						.indicator-pill.blue { background: #dbeafe; color: #1e40af; }
						.indicator-pill.orange { background: #fef3c7; color: #92400e; }
						.indicator-pill.gray { background: #f3f4f6; color: #4b5563; }
					</style>
					<div class="pc-tabs">
						<div class="pc-tab active" data-tab="pending">Pending Proformas (${pendingProformas.length})</div>
						<div class="pc-tab" data-tab="certificates">Payment Certificates (${paymentCertificates.length})</div>
					</div>
					<div class="pc-tab-content active" data-content="pending">
						${proformasHtml}
					</div>
					<div class="pc-tab-content" data-content="certificates">
						${pcsHtml}
					</div>
				`
			}
		],
		primary_action_label: __('Create Proforma Invoice'),
		primary_action: function () {
			create_proforma_invoice_dialog(project);
		}
	});

	// Fix: Ensure proper cleanup when dialog is closed
	d.onhide = function () {
		cleanup_modal_and_restore_dashboard();
	};
	d.show();

	// Tab switching
	d.$wrapper.find('.pc-tab').on('click', function () {
		const tab = $(this).data('tab');
		d.$wrapper.find('.pc-tab').removeClass('active');
		$(this).addClass('active');
		d.$wrapper.find('.pc-tab-content').removeClass('active');
		d.$wrapper.find(`.pc-tab-content[data-content="${tab}"]`).addClass('active');
	});
}

function get_pc_status_color(status) {
	switch (status) {
		case 'Paid': return 'green';
		case 'Invoiced': return 'blue';
		case 'Submitted': return 'blue';
		case 'Draft': return 'orange';
		default: return 'gray';
	}
}

window.create_payment_certificate_from_dialog = function (proforma_invoice, proforma_amount, project) {
	const d = new frappe.ui.Dialog({
		title: __('Create Payment Certificate'),
		fields: [
			{ fieldname: 'proforma_invoice', label: 'Proforma Invoice', fieldtype: 'Link', options: 'Sales Invoice', read_only: 1, default: proforma_invoice },
			{ fieldname: 'proforma_amount', label: 'Proforma Amount', fieldtype: 'Currency', read_only: 1, default: proforma_amount },
			{ fieldtype: 'Column Break' },
			{
				fieldname: 'accepted_amount', label: 'Accepted Amount', fieldtype: 'Currency', reqd: 1, default: proforma_amount,
				description: 'Amount approved by customer',
				onchange: function () {
					const accepted = d.get_value('accepted_amount') || 0;
					const proforma = d.get_value('proforma_amount') || 0;
					const variance = proforma - accepted;
					const variance_percent = proforma > 0 ? (variance / proforma * 100).toFixed(2) : 0;
					d.set_value('variance', variance);
					d.set_value('variance_percent', variance_percent);
				}
			},
			{ fieldtype: 'Section Break', label: 'Variance Calculation' },
			{
				fieldname: 'variance', label: 'Variance', fieldtype: 'Currency', read_only: 1, default: 0,
				description: 'Proforma Amount - Accepted Amount (positive = loss)'
			},
			{ fieldtype: 'Column Break' },
			{ fieldname: 'variance_percent', label: 'Variance %', fieldtype: 'Percent', read_only: 1, default: 0 },
			{ fieldtype: 'Section Break' },
			{ fieldname: 'remarks', label: 'Remarks', fieldtype: 'Small Text' }
		],
		primary_action_label: __('Create'),
		primary_action: function (values) {
			frappe.call({
				method: 'construction_management.construction_management.doctype.payment_certificate.payment_certificate.create_payment_certificate_from_proforma',
				args: {
					proforma_invoice: proforma_invoice,
					accepted_amount: values.accepted_amount,
					remarks: values.remarks
				},
				callback: function (r) {
					if (r.message) {
						d.hide();
						frappe.show_alert({ message: __('Payment Certificate {0} created', [r.message.name]), indicator: 'green' });
						frappe.set_route('Form', 'Payment Certificate', r.message.name);
					}
				}
			});
		}
	});
	d.show();
};

function create_proforma_invoice_dialog(project) {
	frappe.call({
		method: 'frappe.client.get_value',
		args: {
			doctype: 'Project',
			filters: { name: project },
			fieldname: ['customer']
		},
		callback: function (r) {
			const customer = r.message ? r.message.customer : null;

			const d = new frappe.ui.Dialog({
				title: __('Create Proforma Invoice'),
				fields: [
					{
						fieldname: 'bill_no', label: 'Bill No', fieldtype: 'Link', options: 'BOQ Bill',
						get_query: () => ({ filters: { project: project } })
					},
					{
						fieldname: 'boq_item', label: 'BOQ Item', fieldtype: 'Link', options: 'BOQ Item',
						depends_on: 'bill_no',
						get_query: function () { return { filters: { parent_bill: d.get_value('bill_no') } }; }
					},
					{ fieldtype: 'Column Break' },
					{ fieldname: 'amount', label: 'Amount', fieldtype: 'Currency', reqd: 1 },
					{ fieldname: 'description', label: 'Description', fieldtype: 'Small Text' }
				],
				primary_action_label: __('Create Proforma'),
				primary_action: function (values) {
					frappe.call({
						method: 'construction_management.construction_management.doctype.payment_certificate.payment_certificate.create_proforma_invoice',
						args: {
							project: project,
							customer: customer,
							amount: values.amount,
							bill_no: values.bill_no,
							boq_item: values.boq_item,
							description: values.description
						},
						callback: function (r) {
							if (r.message) {
								d.hide();
								frappe.show_alert({ message: __('Proforma Invoice {0} created', [r.message.name]), indicator: 'green' });
								frappe.set_route('Form', 'Sales Invoice', r.message.name);
							}
						}
					});
				}
			});
			d.show();

			// Ensure backdrop/body classes are cleared on close (fixes background staying hidden)
			d.$wrapper.on('hide.bs.modal hidden.bs.modal', () => {
				cleanup_modal_backdrop();
			});
		}
	});
}

function get_modern_styles() {
	return `<style>
		/* Modern Dashboard Styles */
		.boq-dashboard-modern { padding: 0; }
		
		/* Header */
		.dashboard-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px; }
		.header-left { display: flex; align-items: center; gap: 12px; }
		.dashboard-title { font-size: 20px; font-weight: 600; color: #1a1a2e; margin: 0; display: flex; align-items: center; gap: 10px; }
		.dashboard-title svg { color: #5e64ff; }
		.boq-status-badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; }
		.status-draft { background: #e3e8ef; color: #4a5568; }
		.status-approved { background: #c6f6d5; color: #22543d; }
		.status-closed { background: #fed7d7; color: #742a2a; }
		.header-actions { display: flex; gap: 8px; }
		
		/* Buttons */
		.btn-modern { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; border: none; }
		.btn-modern svg { flex-shrink: 0; }
		.btn-primary-modern { background: linear-gradient(135deg, #5e64ff 0%, #7c3aed 100%); color: white; }
		.btn-primary-modern:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(94, 100, 255, 0.4); }
		.btn-success-modern { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; }
		.btn-success-modern:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4); }
		.btn-warning-modern { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; }
		.btn-warning-modern:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4); }
		.btn-info-modern { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; }
		.btn-info-modern:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4); }
		.btn-outline { background: white; border: 1px solid #e2e8f0; color: #4a5568; }
		.btn-outline:hover { background: #f7fafc; border-color: #cbd5e0; }
		.btn-sm { padding: 6px 12px; font-size: 12px; }
		
		/* KPI Grid */
		.kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
		@media (max-width: 992px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
		@media (max-width: 576px) { .kpi-grid { grid-template-columns: 1fr; } }
		.kpi-card { background: white; border-radius: 12px; padding: 20px; display: flex; align-items: flex-start; gap: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; transition: all 0.2s; }
		.kpi-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
		.kpi-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
		.kpi-primary .kpi-icon { background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%); color: #4f46e5; }
		.kpi-info .kpi-icon { background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); color: #2563eb; }
		.kpi-success .kpi-icon { background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); color: #059669; }
		.kpi-warning .kpi-icon { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); color: #d97706; }
		.kpi-content { flex: 1; min-width: 0; }
		.kpi-label { display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
		.kpi-value { display: block; font-size: 22px; font-weight: 700; color: #1f2937; line-height: 1.2; }
		.kpi-progress { height: 4px; background: #e5e7eb; border-radius: 2px; margin-top: 8px; overflow: hidden; }
		.kpi-progress-bar { height: 100%; border-radius: 2px; transition: width 0.3s; }
		.kpi-info .kpi-progress-bar { background: linear-gradient(90deg, #3b82f6, #2563eb); }
		.kpi-success .kpi-progress-bar { background: linear-gradient(90deg, #10b981, #059669); }
		.kpi-sub { display: block; font-size: 11px; color: #9ca3af; margin-top: 4px; }
		.kpi-breakdown { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
		.breakdown-item { font-size: 10px; }
		.breakdown-item.advance { color: #7c3aed; }
		.breakdown-item.invoice { color: #059669; }
		.breakdown-divider { color: #d1d5db; font-size: 10px; }
		
		/* Action Bar */
		.action-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 12px 16px; background: #f8fafc; border-radius: 10px; flex-wrap: wrap; gap: 12px; }
		.action-bar-left, .action-bar-right { display: flex; gap: 8px; flex-wrap: wrap; }
		
		/* Bills Accordion */
		.bills-accordion { display: flex; flex-direction: column; gap: 12px; }
		.bill-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; transition: all 0.2s; }
		.bill-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
		.bill-card.expanded { box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
		.bill-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; cursor: pointer; background: #fafbfc; transition: background 0.2s; }
		.bill-header:hover { background: #f1f5f9; }
		.bill-header-left { display: flex; align-items: center; gap: 12px; }
		.chevron-icon { transition: transform 0.2s; color: #9ca3af; }
		.bill-card.expanded .chevron-icon { transform: rotate(180deg); }
		.bill-info { display: flex; flex-direction: column; }
		.bill-title { font-size: 15px; font-weight: 600; color: #1f2937; }
		.bill-desc { font-size: 12px; color: #6b7280; margin-top: 2px; }
		.bill-header-right { display: flex; gap: 24px; }
		.bill-stat { display: flex; flex-direction: column; align-items: flex-end; }
		.stat-label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
		.stat-value { font-size: 14px; font-weight: 600; color: #374151; }
		.balance-value { color: #059669; }
		.advance-stat { background: linear-gradient(135deg, #f3e8ff 0%, #ede9fe 100%); border-radius: 6px; padding: 4px 8px; }
		.advance-value { color: #7c3aed; }
		.bill-content { border-top: 1px solid #e2e8f0; }
		.bill-toolbar { padding: 12px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
		.no-bills-message, .no-items-message { text-align: center; padding: 40px 20px; color: #9ca3af; font-size: 14px; }

		/* Items Table */
		.items-table-wrapper { overflow-x: auto; }
		.items-table { width: 100%; border-collapse: collapse; font-size: 12px; }
		.items-table th { background: #f8fafc; padding: 8px 10px; text-align: left; font-weight: 500; color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
		.items-table td { padding: 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
		.items-table tr:hover { background: #fafbfc; }
		.items-table tr.fully-billed { opacity: 0.6; }
		.col-desc { min-width: 180px; }
		.col-unit { width: 50px; text-align: center; }
		.col-num { width: 80px; text-align: right; white-space: nowrap; }
		.col-group { text-align: center; background: #f1f5f9; }
		.col-highlight-blue { background: #eff6ff !important; }
		.col-highlight-green { background: #f0fdf4 !important; }
		.col-status { width: 90px; }
		.col-actions { width: 180px; min-width: 180px; }
		.font-bold { font-weight: 600; }
		.item-desc-wrapper { display: flex; flex-direction: column; gap: 2px; }
		.item-code { font-size: 9px; color: #6366f1; background: #eef2ff; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 2px; }
		.item-desc { color: #374151; line-height: 1.3; font-size: 12px; }
		.current-qty-input, .current-value-input { width: 70px; padding: 5px 6px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; text-align: right; transition: all 0.2s; }
		.current-qty-input:focus, .current-value-input:focus { outline: none; border-color: #5e64ff; box-shadow: 0 0 0 3px rgba(94, 100, 255, 0.1); }
		.current-qty-input:disabled, .current-value-input:disabled { background: #f3f4f6; color: #9ca3af; }
		.balance-cell { color: #059669; font-weight: 500; }
		
		/* Status Pills */
		.status-pill { display: inline-block; padding: 3px 8px; border-radius: 20px; font-size: 10px; font-weight: 500; }
		.status-success { background: #d1fae5; color: #065f46; }
		.status-warning { background: #fef3c7; color: #92400e; }
		.status-default { background: #f3f4f6; color: #6b7280; }
		
		/* Action Icon Buttons */
		.action-icons { display: flex; gap: 4px; justify-content: center; flex-wrap: nowrap; }
		.action-icon-btn { width: 28px; height: 28px; min-width: 28px; border-radius: 6px; border: 1px solid #e2e8f0; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; color: #6b7280; flex-shrink: 0; }
		.action-icon-btn:hover:not(:disabled) { transform: scale(1.05); }
		.action-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
		.action-invoice:hover:not(:disabled) { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
		.action-history:hover:not(:disabled) { background: #fef3c7; color: #d97706; border-color: #fde68a; }
		.action-cost:hover:not(:disabled) { background: #d1fae5; color: #059669; border-color: #a7f3d0; }
		.action-edit:hover:not(:disabled) { background: #f3e8ff; color: #7c3aed; border-color: #ddd6fe; }
		
		/* Empty State */
		.boq-empty-state { text-align: center; padding: 60px 20px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 16px; border: 2px dashed #e2e8f0; }
		.empty-icon { margin-bottom: 20px; color: #cbd5e0; }
		.boq-empty-state h3 { font-size: 20px; font-weight: 600; color: #374151; margin-bottom: 8px; }
		.boq-empty-state p { color: #6b7280; margin-bottom: 24px; max-width: 400px; margin-left: auto; margin-right: auto; }
	</style>`;
}


// Quick DPR Creation with Modern UI - Multi-select for Employees/Assets
window.create_dpr_quick = function (project) {
	// First fetch BOQ items for the project
	frappe.call({
		method: 'construction_management.api.dpr_utils.get_boq_items_for_project',
		args: { project: project },
		callback: function (r) {
			if (r.message && r.message.length > 0) {
				show_dpr_dialog(project, r.message);
			} else {
				frappe.msgprint(__('No BOQ Items found for this project. Please create BOQ Items first.'));
			}
		}
	});
};

function show_dpr_dialog(project, boq_items) {
	// Build BOQ Item options
	const boq_options = boq_items.map(item => ({
		value: item.name,
		label: `${item.bill_number} - ${item.description.substring(0, 50)}${item.description.length > 50 ? '...' : ''}`
	}));

	const cache_key = `cm_dpr_quick_cache_${project}`;

	const d = new frappe.ui.Dialog({
		title: __('Quick Daily Progress Record'),
		size: 'large',
		minimizable: true,
		fields: [
			{
				fieldtype: 'HTML',
				fieldname: 'dpr_header',
				options: `
					<div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
						<h4 style="margin: 0; font-size: 16px;">📋 Record Daily Progress</h4>
						<p style="margin: 8px 0 0 0; font-size: 13px; opacity: 0.9;">Enter costs for today's work. Select a BOQ Item and add costs below.</p>
					</div>
				`
			},
			{
				fieldname: 'date',
				label: __('Date'),
				fieldtype: 'Date',
				default: frappe.datetime.get_today(),
				reqd: 1
			},
			{
				fieldname: 'bill_no',
				label: __('Bill No'),
				fieldtype: 'Link',
				options: 'BOQ Bill',
				reqd: 1,
				get_query: () => ({ filters: { project: project } }),
				change: function () {
					// When bill is chosen, adjust BOQ item query and set project if available
					const bill = d.get_value('bill_no');
					if (bill) {
						d.set_query('boq_item', () => ({ filters: { parent_bill: bill } }));
						// Auto-populate project from bill if not already
						if (!project) {
							frappe.db.get_value('BOQ Bill', bill, 'project', (r) => {
								if (r && r.project) project = r.project;
							});
						}
					}
				}
			},
			{
				fieldname: 'boq_item',
				label: __('BOQ Item'),
				fieldtype: 'Link',
				options: 'BOQ Item',
				reqd: 1,
				get_query: function () {
					const bill = d.get_value('bill_no');
					if (bill) {
						return { filters: { parent_bill: bill } };
					}
					return { filters: { project: project } };
				},
				change: function () {
					// Auto set bill_no from BOQ item if missing
					if (!d.get_value('bill_no')) {
						const item = d.get_value('boq_item');
						if (item) {
							frappe.db.get_value('BOQ Item', item, 'parent_bill', (r) => {
								if (r && r.parent_bill) d.set_value('bill_no', r.parent_bill);
							});
						}
					}
				}
			},
			{
				fieldname: 'project_sites',
				label: __('Project Site'),
				fieldtype: 'Link',
				options: 'Project Sites',
				reqd: 0, // Will be set based on BOQ Settings
				get_query: () => {
					return {
						filters: {
							project: project
						}
					};
				}
			},
			{
				fieldtype: 'Section Break',
				label: __('Cost Entry'),
				fieldname: 'cost_section'
			},
			{
				fieldtype: 'HTML',
				fieldname: 'cost_tabs',
				options: `
					<div class="dpr-cost-tabs">
						<button type="button" class="dpr-tab active" data-tab="labour">👷 Labour</button>
						<button type="button" class="dpr-tab" data-tab="material">📦 Material</button>
						<button type="button" class="dpr-tab" data-tab="asset">🚜 Asset</button>
						<button type="button" class="dpr-tab" data-tab="subcontract">🏗️ Subcontract</button>
						<button type="button" class="dpr-tab" data-tab="expense">💰 Expense</button>
					</div>
					<style>
						.dpr-cost-tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
						.dpr-tab { padding: 10px 16px; border: 1px solid #e2e8f0; border-radius: 8px; background: white; cursor: pointer; font-size: 13px; transition: all 0.2s; }
						.dpr-tab:hover { background: #f8fafc; }
						.dpr-tab.active { background: linear-gradient(135deg, #5e64ff 0%, #7c3aed 100%); color: white; border-color: transparent; }
						.dpr-cost-panel { display: none; padding: 16px; background: #f8fafc; border-radius: 8px; }
						.dpr-cost-panel.active { display: block; }
						.cost-input-row { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
						.cost-input-row label { min-width: 100px; font-size: 13px; color: #4a5568; }
						.cost-input-row input, .cost-input-row select { flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; }
						.cost-input-row input:focus, .cost-input-row select:focus { outline: none; border-color: #5e64ff; box-shadow: 0 0 0 3px rgba(94, 100, 255, 0.1); }
						.total-display { background: white; padding: 12px 16px; border-radius: 8px; margin-top: 16px; display: flex; justify-content: space-between; align-items: center; }
						.total-label { font-size: 14px; color: #6b7280; }
						.total-value { font-size: 20px; font-weight: 700; color: #1f2937; }
					</style>
				`
			},
			{
				fieldtype: 'HTML',
				fieldname: 'cost_panels',
				options: `
					<div id="labour-panel" class="dpr-cost-panel active">
						<div class="cost-input-row">
							<label>Labour Cost</label>
							<input type="number" id="dpr-labour-cost" placeholder="Enter amount" value="0" step="0.01">
						</div>
						<p style="font-size: 12px; color: #6b7280; margin: 0;">💡 For detailed employee-wise entry, use the full DPR form</p>
					</div>
					<div id="material-panel" class="dpr-cost-panel">
						<div class="cost-input-row">
							<label>Material Cost</label>
							<input type="number" id="dpr-material-cost" placeholder="Enter amount" value="0" step="0.01">
						</div>
						<p style="font-size: 12px; color: #6b7280; margin: 0;">💡 For stock entry with items, use the full DPR form</p>
					</div>
					<div id="asset-panel" class="dpr-cost-panel">
						<div class="cost-input-row">
							<label>Asset Cost</label>
							<input type="number" id="dpr-asset-cost" placeholder="Enter amount" value="0" step="0.01">
						</div>
						<p style="font-size: 12px; color: #6b7280; margin: 0;">💡 For asset-wise entry with rates, use the full DPR form</p>
					</div>
					<div id="subcontract-panel" class="dpr-cost-panel">
						<div class="cost-input-row">
							<label>Subcontract Cost</label>
							<input type="number" id="dpr-subcontract-cost" placeholder="Enter amount" value="0" step="0.01">
						</div>
					</div>
					<div id="expense-panel" class="dpr-cost-panel">
						<div class="cost-input-row">
							<label>Other Expense</label>
							<input type="number" id="dpr-expense-cost" placeholder="Enter amount" value="0" step="0.01">
						</div>
						<p style="font-size: 12px; color: #6b7280; margin: 0;">💡 For expense-wise entry with accounts, use the full DPR form</p>
					</div>
					<div class="total-display">
						<span class="total-label">Total Cost</span>
						<span class="total-value" id="dpr-total-cost">0.00</span>
					</div>
				`
			},
			{
				fieldtype: 'Section Break',
				fieldname: 'remarks_section'
			},
			{
				fieldname: 'remarks',
				label: __('Remarks'),
				fieldtype: 'Small Text'
			}
		],
		primary_action_label: __('Create DPR'),
		primary_action: function () {
			const values = d.get_values();
			if (!values) return;

			const labour_cost = parseFloat($('#dpr-labour-cost').val()) || 0;
			const material_cost = parseFloat($('#dpr-material-cost').val()) || 0;
			const asset_cost = parseFloat($('#dpr-asset-cost').val()) || 0;
			const subcontract_cost = parseFloat($('#dpr-subcontract-cost').val()) || 0;
			const expense_cost = parseFloat($('#dpr-expense-cost').val()) || 0;
			const total_cost = labour_cost + material_cost + asset_cost + subcontract_cost + expense_cost;

			if (total_cost <= 0) {
				frappe.show_alert({ message: __('Please enter at least one cost value'), indicator: 'orange' });
				return;
			}

			frappe.call({
				method: 'frappe.client.insert',
				args: {
					doc: {
						doctype: 'Daily Progress Record',
						project: project,
						boq_item: values.boq_item,
						date: values.date,
						labour_cost: labour_cost,
						material_cost: material_cost,
						asset_cost: asset_cost,
						subcontract_cost: subcontract_cost,
						expense_cost: expense_cost,
						remarks: values.remarks
					}
				},
				callback: function (r) {
					if (r.message) {
						d.hide();
						frappe.show_alert({ message: __('DPR {0} created', [r.message.name]), indicator: 'green' });

						// Ask if user wants to submit
						frappe.confirm(
							__('DPR created successfully. Do you want to submit it now?'),
							function () {
								frappe.call({
									method: 'frappe.client.submit',
									args: { doc: r.message },
									callback: function () {
										frappe.show_alert({ message: __('DPR submitted'), indicator: 'green' });
										cur_frm.reload_doc();
									}
								});
							},
							function () {
								cur_frm.reload_doc();
							}
						);
					}
				}
			});
		},
		secondary_action_label: __('Open Full Form'),
		secondary_action: function () {
			d.hide();
			frappe.new_doc('Daily Progress Record', {
				project: project
			});
		}
	});

	// Cache helpers
	const load_cache = () => {
		try {
			const cached = JSON.parse(localStorage.getItem(cache_key) || '{}');
			if (!Object.keys(cached).length) return;
			if (cached.date) d.set_value('date', cached.date);
			if (cached.bill_no) d.set_value('bill_no', cached.bill_no);
			if (cached.boq_item) d.set_value('boq_item', cached.boq_item);
			if (cached.project_sites) d.set_value('project_sites', cached.project_sites);
			if (cached.remarks) d.set_value('remarks', cached.remarks);
			$('#dpr-labour-cost').val(cached.labour_cost || 0);
			$('#dpr-material-cost').val(cached.material_cost || 0);
			$('#dpr-asset-cost').val(cached.asset_cost || 0);
			$('#dpr-subcontract-cost').val(cached.subcontract_cost || 0);
			$('#dpr-expense-cost').val(cached.expense_cost || 0);
			$('#dpr-total-cost').text(format_currency(cached.total_cost || 0));
		} catch (e) {
			// ignore cache errors
		}
	};

	const save_cache = () => {
		try {
			const values = d.get_values() || {};
			const cached = {
				date: values.date,
				bill_no: values.bill_no,
				boq_item: values.boq_item,
				project_sites: values.project_sites,
				remarks: values.remarks,
				labour_cost: parseFloat($('#dpr-labour-cost').val()) || 0,
				material_cost: parseFloat($('#dpr-material-cost').val()) || 0,
				asset_cost: parseFloat($('#dpr-asset-cost').val()) || 0,
				subcontract_cost: parseFloat($('#dpr-subcontract-cost').val()) || 0,
				expense_cost: parseFloat($('#dpr-expense-cost').val()) || 0
			};
			cached.total_cost = cached.labour_cost + cached.material_cost + cached.asset_cost + cached.subcontract_cost + cached.expense_cost;
			localStorage.setItem(cache_key, JSON.stringify(cached));
		} catch (e) {
			// ignore cache errors
		}
	};

	// Fix: Ensure proper cleanup when dialog is closed
	d.onhide = function () {
		cleanup_modal_and_restore_dashboard();
		save_cache();
	};
	d.show();
	load_cache();

	// Attach tab switching logic
	setTimeout(() => {
		d.$wrapper.find('.dpr-tab').on('click', function () {
			const tab = $(this).data('tab');
			d.$wrapper.find('.dpr-tab').removeClass('active');
			$(this).addClass('active');
			d.$wrapper.find('.dpr-cost-panel').removeClass('active');
			d.$wrapper.find(`#${tab}-panel`).addClass('active');
		});

		// Attach cost calculation
		d.$wrapper.find('input[type="number"]').on('input', function () {
			const labour = parseFloat($('#dpr-labour-cost').val()) || 0;
			const material = parseFloat($('#dpr-material-cost').val()) || 0;
			const asset = parseFloat($('#dpr-asset-cost').val()) || 0;
			const subcontract = parseFloat($('#dpr-subcontract-cost').val()) || 0;
			const expense = parseFloat($('#dpr-expense-cost').val()) || 0;
			const total = labour + material + asset + subcontract + expense;
			$('#dpr-total-cost').text(format_currency(total));
			save_cache();
		});

		// Trigger project site search on focus (no need to type space)
		const site_ctrl = d.fields_dict.project_sites;
		if (site_ctrl && site_ctrl.$input) {
			const trigger_sites = () => {
				const awesomplete = site_ctrl.$input.data('awesomplete');
				if (awesomplete) {
					awesomplete.minChars = 0;
					awesomplete.evaluate();
				} else {
					site_ctrl.$input.trigger('input');
				}
			};
			site_ctrl.$input.on('focus', trigger_sites);
			setTimeout(trigger_sites, 150);
		}

		// Persist cache on field changes
		d.$wrapper.on('change input', 'input, textarea, select', frappe.utils.debounce(save_cache, 300));
	}, 100);
}


// ============================================
// Clean DPR Dialog using Frappe Native Fields
// ============================================

// Store selected items for DPR
let dpr_selected_employees = [];
let dpr_selected_assets = [];
let dpr_selected_materials = [];
let dpr_selected_expenses = [];
let dpr_selected_overheads = [];
let dpr_project_context = null;

// Override the show_dpr_dialog_enhanced function
window.show_dpr_dialog_enhanced = function (project) {
	// 1. Check if we can reuse existing dialog
	if (window.cur_dpr_dialog && dpr_selected_employees && dpr_project_context === project) {
		const d = window.cur_dpr_dialog;
		d.show();
		// Re-render lists to be safe (in case rendering was lost but data kept)
		setTimeout(() => {
			render_employees_list();
			render_materials_list();
			render_assets_list();
			render_expenses_list();
			render_overheads_list();
		}, 100);
		return;
	}

	// 2. If project changed or no dialog, reset and create new
	if (dpr_project_context !== project) {
		if (window.cur_dpr_dialog) {
			try { window.cur_dpr_dialog.hide(); } catch (e) { } // Ensure old is closed
			window.cur_dpr_dialog = null;
		}

		dpr_selected_employees = [];
		dpr_selected_assets = [];
		dpr_selected_materials = [];
		dpr_selected_expenses = [];
		dpr_selected_overheads = [];
		dpr_project_context = project;
	}

	const d = new frappe.ui.Dialog({
		title: __('Quick Daily Progress Record'),
		size: 'extra-large',
		minimizable: true,
		fields: [
			{
				fieldtype: 'HTML',
				fieldname: 'dpr_header',
				options: '<div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 16px; border-radius: 8px; margin-bottom: 16px;"><h4 style="margin: 0; font-size: 16px;">📋 Record Daily Progress</h4><p style="margin: 8px 0 0 0; font-size: 13px; opacity: 0.9;">Add employees, materials, assets, expenses and overheads. Rates are auto-fetched from system.</p></div>'
			},
			{ fieldname: 'date', label: __('Date'), fieldtype: 'Date', default: frappe.datetime.get_today(), reqd: 1 },
			{
				fieldname: 'bill_no', label: __('Bill No'), fieldtype: 'Link', options: 'BOQ Bill', reqd: 1,
				get_query: () => ({ filters: { project: project } }),
				change: function () {
					const bill = d.get_value('bill_no');
					if (bill) {
						d.set_query('boq_item', () => ({ filters: { parent_bill: bill } }));
					}
				}
			},
			{
				fieldname: 'boq_item', label: __('BOQ Item'), fieldtype: 'Link', options: 'BOQ Item', reqd: 1,
				get_query: () => {
					const bill = d.get_value('bill_no');
					if (bill) {
						return { filters: { parent_bill: bill } };
					}
					return { filters: { project: project } };
				},
				change: function () {
					if (!d.get_value('bill_no')) {
						const item = d.get_value('boq_item');
						if (item) {
							frappe.db.get_value('BOQ Item', item, 'parent_bill', (r) => {
								if (r && r.parent_bill) d.set_value('bill_no', r.parent_bill);
							});
						}
					}
				}
			},
			{
				fieldname: 'project_sites',
				label: __('Project Site'),
				fieldtype: 'Link',
				options: 'Project Sites',
				reqd: 0, // Will be set based on BOQ Settings
				get_query: () => {
					return {
						filters: {
							project: project
						}
					};
				}
			},
			// Labour Section
			{ fieldtype: 'Section Break', label: __('👷 Labour Cost') },
			{
				fieldname: 'employee', label: __('Add Employee'), fieldtype: 'Link', options: 'Employee',
				get_query: () => ({ filters: { status: 'Active' } }),
				change: function () {
					const emp = d.get_value('employee');
					if (emp) add_employee_to_list(d, emp, project);
				}
			},
			{ fieldtype: 'HTML', fieldname: 'employees_list', options: '<div id="dpr-employees-list"></div>' },
			// Material Section
			{ fieldtype: 'Section Break', label: __('📦 Material Cost') },
			{
				fieldname: 'item_code', label: __('Add Item'), fieldtype: 'Link', options: 'Item',
				get_query: () => {
					const site_warehouse = cur_frm?.doc?.site_location;
					if (site_warehouse) {
						return {
							query: 'construction_management.api.dpr_utils.get_warehouse_items_query',
							filters: { warehouse: site_warehouse, project: project }
						};
					}
					return { filters: { is_stock_item: 1 } };
				},
				change: function () {
					const item = d.get_value('item_code');
					if (item) show_material_qty_dialog(d, item, project);
				}
			},
			{ fieldtype: 'HTML', fieldname: 'materials_list', options: '<div id="dpr-materials-list"></div>' },
			// Asset Section
			{ fieldtype: 'Section Break', label: __('🚜 Asset Cost') },
			{
				fieldname: 'asset', label: __('Add Asset'), fieldtype: 'Link', options: 'Asset',
				get_query: () => ({
					query: 'construction_management.api.asset_billing.get_assets_with_billing',
					filters: { project }
				}),
				change: function () {
					const asset = d.get_value('asset');
					if (asset) add_asset_to_list(d, asset, project);
				}
			},
			{ fieldtype: 'HTML', fieldname: 'assets_list', options: '<div id="dpr-assets-list"></div>' },
			// Expense Section
			{ fieldtype: 'Section Break', label: __('💰 Expenses') },
			{
				fieldname: 'expense_type', label: __('Add Expense'), fieldtype: 'Link', options: 'Expense Claim Type',
				change: function () {
					const expType = d.get_value('expense_type');
					if (expType) show_expense_dialog(d, expType);
				}
			},
			{ fieldtype: 'HTML', fieldname: 'expenses_list', options: '<div id="dpr-expenses-list"></div>' },
			// Overhead Section
			{ fieldtype: 'Section Break', label: __('📊 Overheads') },
			{
				fieldname: 'overhead_account', label: __('Add Overhead'), fieldtype: 'Link', options: 'Account',
				get_query: () => ({ filters: { account_type: ['in', ['Expense Account', 'Cost of Goods Sold']], is_group: 0 } }),
				change: function () {
					const acc = d.get_value('overhead_account');
					if (acc) show_overhead_dialog(d, acc);
				}
			},
			{ fieldtype: 'HTML', fieldname: 'overheads_list', options: '<div id="dpr-overheads-list"></div>' },
			// Subcontract Section
			{ fieldtype: 'Section Break', label: __('🏗️ Subcontract') },
			{
				fieldname: 'subcontract_cost', label: __('Subcontract Cost'), fieldtype: 'Currency', default: 0,
				change: function () { update_dpr_totals(d); }
			},
			// Totals Section
			{ fieldtype: 'Section Break' },
			{ fieldtype: 'HTML', fieldname: 'totals_display', options: '<div id="dpr-totals" style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin-top: 8px;"><div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 16px;"><div><span style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Labour</span><div id="dpr-labour-total" style="font-size: 16px; font-weight: 600; color: #1f2937;">0.00</div></div><div><span style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Material</span><div id="dpr-material-total" style="font-size: 16px; font-weight: 600; color: #1f2937;">0.00</div></div><div><span style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Asset</span><div id="dpr-asset-total" style="font-size: 16px; font-weight: 600; color: #1f2937;">0.00</div></div><div><span style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Expense</span><div id="dpr-expense-total" style="font-size: 16px; font-weight: 600; color: #1f2937;">0.00</div></div><div><span style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Overhead</span><div id="dpr-overhead-total" style="font-size: 16px; font-weight: 600; color: #1f2937;">0.00</div></div><div><span style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Subcontract</span><div id="dpr-subcontract-total" style="font-size: 16px; font-weight: 600; color: #1f2937;">0.00</div></div><div style="border-left: 2px solid #059669; padding-left: 16px;"><span style="font-size: 11px; color: #059669; font-weight: 600; text-transform: uppercase;">TOTAL COST</span><div id="dpr-grand-total" style="font-size: 22px; font-weight: 700; color: #059669;">0.00</div></div></div></div>' },
			{ fieldtype: 'Section Break' },
			{ fieldname: 'remarks', label: __('Remarks'), fieldtype: 'Small Text' }
		],
		primary_action_label: __('Create DPR'),
		primary_action: function () { create_dpr_from_dialog(d, project); },
		secondary_action_label: __('Open Full Form'),
		secondary_action: function () { d.hide(); frappe.new_doc('Daily Progress Record', { project: project }); }
	});

	// Fix: Ensure proper cleanup when dialog is closed
	d.onhide = function () {
		cleanup_modal_and_restore_dashboard();
	};

	// Store instance globally
	window.cur_dpr_dialog = d;

	d.show();

	// Add styles and render lists
	setTimeout(() => {
		$('<style>.dpr-item-card{display:flex;align-items:center;gap:12px;padding:10px 12px;background:white;border-radius:8px;margin-bottom:8px;border:1px solid #e2e8f0;transition:all 0.2s}.dpr-item-card:hover{border-color:#cbd5e1;box-shadow:0 2px 4px rgba(0,0,0,0.05)}.dpr-item-info{flex:1;min-width:0}.dpr-item-name{font-weight:500;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dpr-item-sub{font-size:12px;color:#6b7280;margin-top:2px}.dpr-item-input{width:70px;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;text-align:right;font-size:13px}.dpr-item-input:focus{outline:none;border-color:#5e64ff;box-shadow:0 0 0 2px rgba(94,100,255,0.1)}.dpr-item-amount{min-width:90px;text-align:right;font-weight:600;color:#059669;font-size:14px}.dpr-remove-btn{background:#fee2e2;color:#dc2626;border:none;width:28px;height:28px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s}.dpr-remove-btn:hover{background:#fecaca}.dpr-empty{text-align:center;padding:24px;color:#9ca3af;font-size:13px;background:#f9fafb;border-radius:8px;border:1px dashed #e2e8f0}.rate-source-tag{display:inline-block;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:500;background:#e0f2fe;color:#0369a1;margin-left:4px;text-transform:uppercase}</style>').appendTo(d.$wrapper);
		render_employees_list();
		render_materials_list();
		render_assets_list();
		render_expenses_list();
		render_overheads_list();
	}, 100);
};

// Helper functions for DPR dialog

function add_employee_to_list(d, employee, project) {
	if (employee && dpr_selected_employees.find(e => e.employee === employee)) {
		frappe.show_alert({ message: __('Employee already added'), indicator: 'orange' });
		d.set_value('employee', '');
		return;
	}

	frappe.call({
		method: 'construction_management.api.dpr_utils.get_employee_with_rate',
		args: { employee: employee },
		callback: function (r) {
			if (r.message) {
				const emp = r.message;
				const rate = emp.rate_per_day || 0;
				const source = emp.source || 'unknown';

				// If rate is 0 or source is manual_required, ask for manual entry
				if (!rate || source === 'manual_required') {
					frappe.prompt([
						{
							fieldname: 'rate', label: __('Daily Rate'), fieldtype: 'Currency', reqd: 1,
							description: __('No salary rate found in Salary Structure Assignment or Salary Structure. Please enter daily rate manually.')
						}
					], function (values) {
						dpr_selected_employees.push({
							employee: employee, employee_name: emp.employee_name, designation: emp.designation || '',
							hours: 8, rate_per_day: values.rate, amount: values.rate, source: 'manual'
						});
						render_employees_list();
						update_dpr_totals(d);
					}, __('Enter Daily Rate for ' + emp.employee_name), __('Add'));
				} else {
					// Show source indicator
					const sourceLabel = source === 'cache' ? 'cached' :
						(source === 'salary_structure_assignment' ? 'SSA' :
							(source === 'salary_structure' ? 'SS' : source));

					dpr_selected_employees.push({
						employee: employee, employee_name: emp.employee_name, designation: emp.designation || '',
						hours: 8, rate_per_day: rate, amount: rate, source: sourceLabel
					});
					render_employees_list();
					update_dpr_totals(d);
				}
			}
			d.set_value('employee', '');
		}
	});
}

function add_asset_to_list(d, asset, project) {
	if (dpr_selected_assets.find(a => a.asset === asset)) {
		frappe.show_alert({ message: __('Asset already added'), indicator: 'orange' });
		d.set_value('asset', '');
		return;
	}

	frappe.call({
		method: 'construction_management.api.dpr_utils.get_asset_with_rate',
		args: { asset: asset, project: project, date: d.get_value('date') },
		callback: function (r) {
			if (r.message) {
				const assetData = r.message;
				// Use hourly rate (Task 1.4: Handle missing asset rate)
				const rate_per_hour = assetData.rate_per_hour || 0;
				const default_hours = 8;

				// Enforce billing presence: if no rate, block selection
				if (!rate_per_hour) {
					frappe.show_alert({
						message: __('No Project Asset Billing rate found for asset {0}. Please configure it before using in DPR.', [assetData.asset_name || asset]),
						indicator: 'red'
					});
					d.set_value('asset', '');
					return;
				}

				const amount = rate_per_hour * default_hours;
				dpr_selected_assets.push({
					asset: asset,
					asset_name: assetData.asset_name,
					hours: default_hours,
					rate_per_hour: rate_per_hour,
					rate_per_day: rate_per_hour * 8, // For backward compat
					amount: amount
				});
				render_assets_list();
				update_dpr_totals(d);
			}
			d.set_value('asset', '');
		}
	});
}

function show_material_qty_dialog(d, item_code, project) {
	if (dpr_selected_materials.find(m => m.item_code === item_code)) {
		frappe.show_alert({ message: __('Item already added'), indicator: 'orange' });
		d.set_value('item_code', '');
		return;
	}

	// Prefer warehouse chosen in dialog, fallback to project site_location
	const site_warehouse = d.get_value('warehouse') || cur_frm?.doc?.site_location || '';

	frappe.call({
		method: 'construction_management.api.dpr_utils.get_item_details',
		args: { item_code: item_code },
		callback: function (r) {
			if (r.message) {
				const item = r.message;
				const rateDesc = item.rate_source === 'Item Price'
					? __('Rate from Item Price (for costing)')
					: __('Valuation Rate (no Item Price found)');

				frappe.prompt([
					{ fieldname: 'qty', label: __('Quantity'), fieldtype: 'Float', reqd: 1, default: 1 },
					{
						fieldname: 'warehouse', label: __('Source Warehouse'), fieldtype: 'Link', options: 'Warehouse', reqd: 1,
						default: site_warehouse,
						description: __('Stock will be transferred from this warehouse on submit')
					},
					{
						fieldname: 'rate', label: __('Rate (for Costing)'), fieldtype: 'Currency', default: item.rate || 0,
						description: rateDesc
					}
				], function (values) {
					const amount = flt(values.qty) * flt(values.rate);
					dpr_selected_materials.push({
						item_code: item_code,
						item_name: item.item_name,
						warehouse: values.warehouse,
						qty: values.qty,
						uom: item.stock_uom,
						rate: values.rate,  // For DPR costing
						valuation_rate: item.valuation_rate,  // For Stock Entry
						amount: amount,
						rate_source: item.rate_source
					});
					render_materials_list();
					update_dpr_totals(d);
				}, __('Add Material: ' + item.item_name), __('Add'));
			}
			d.set_value('item_code', '');
		}
	});
}

function show_expense_dialog(d, expense_type) {
	frappe.prompt([
		{ fieldname: 'description', label: __('Description'), fieldtype: 'Small Text' },
		{ fieldname: 'amount', label: __('Amount'), fieldtype: 'Currency', reqd: 1 }
	], function (values) {
		dpr_selected_expenses.push({
			expense_type: expense_type, description: values.description || '', amount: values.amount
		});
		render_expenses_list();
		update_dpr_totals(d);
	}, __('Add Expense: ' + expense_type), __('Add'));
	d.set_value('expense_type', '');
}

function show_overhead_dialog(d, account) {
	frappe.db.get_value('Account', account, 'account_name', (r) => {
		const account_name = r ? r.account_name : account;
		frappe.prompt([
			{ fieldname: 'description', label: __('Description'), fieldtype: 'Small Text' },
			{ fieldname: 'amount', label: __('Amount'), fieldtype: 'Currency', reqd: 1 }
		], function (values) {
			dpr_selected_overheads.push({
				account: account, account_name: account_name, description: values.description || '', amount: values.amount
			});
			render_overheads_list();
			update_dpr_totals(d);
		}, __('Add Overhead: ' + account_name), __('Add'));
	});
	d.set_value('overhead_account', '');
}

function render_employees_list() {
	let html = dpr_selected_employees.length === 0
		? '<div class="dpr-empty">No employees added. Select an employee above to add.</div>'
		: '';
	dpr_selected_employees.forEach((emp, idx) => {
		const sourceTag = emp.source ? `<span class="rate-source-tag">${emp.source}</span>` : '';
		html += '<div class="dpr-item-card"><div class="dpr-item-info"><div class="dpr-item-name">' + emp.employee_name + '</div><div class="dpr-item-sub">' + (emp.designation || 'No designation') + ' • ' + format_currency(emp.rate_per_day) + '/day ' + sourceTag + '</div></div><div><input type="number" class="dpr-item-input emp-hours" value="' + emp.hours + '" step="0.5" min="0" max="24" data-idx="' + idx + '"> hrs</div><div class="dpr-item-amount">' + format_currency(emp.amount) + '</div><button type="button" class="dpr-remove-btn" onclick="remove_dpr_employee(' + idx + ')">✕</button></div>';
	});
	$('#dpr-employees-list').html(html);
	$('.emp-hours').off('input').on('input', function () {
		const idx = $(this).data('idx');
		const hours = parseFloat($(this).val()) || 8;
		dpr_selected_employees[idx].hours = hours;
		dpr_selected_employees[idx].amount = dpr_selected_employees[idx].rate_per_day * (hours / 8);
		render_employees_list();
		update_dpr_totals();
	});
}

function render_materials_list() {
	let html = dpr_selected_materials.length === 0
		? '<div class="dpr-empty">No materials added. Select an item above to add.</div>'
		: '';
	dpr_selected_materials.forEach((mat, idx) => {
		const sourceTag = mat.rate_source ? `<span class="rate-source-tag">${mat.rate_source === 'Item Price' ? 'Price' : 'Val'}</span>` : '';
		html += '<div class="dpr-item-card"><div class="dpr-item-info"><div class="dpr-item-name">' + mat.item_name + '</div><div class="dpr-item-sub">' + mat.item_code + ' • ' + mat.warehouse + ' • ' + mat.qty + ' ' + mat.uom + ' @ ' + format_currency(mat.rate) + ' ' + sourceTag + '</div></div><div class="dpr-item-amount">' + format_currency(mat.amount) + '</div><button type="button" class="dpr-remove-btn" onclick="remove_dpr_material(' + idx + ')">✕</button></div>';
	});
	$('#dpr-materials-list').html(html);
}

function render_assets_list() {
	let html = dpr_selected_assets.length === 0
		? '<div class="dpr-empty">No assets added. Select an asset above to add.</div>'
		: '';
	dpr_selected_assets.forEach((asset, idx) => {
		// Use hourly rate for display (Task 1.3: Asset cost = rate_per_hour × hours)
		const rateDisplay = asset.rate_per_hour ? format_currency(asset.rate_per_hour) + '/hr' : format_currency(asset.rate_per_day) + '/day';
		html += '<div class="dpr-item-card"><div class="dpr-item-info"><div class="dpr-item-name">' + asset.asset_name + '</div><div class="dpr-item-sub">' + asset.asset + ' • ' + rateDisplay + '</div></div><div><input type="number" class="dpr-item-input asset-hours" value="' + asset.hours + '" step="0.5" min="0" max="24" data-idx="' + idx + '"> hrs</div><div class="dpr-item-amount">' + format_currency(asset.amount) + '</div><button type="button" class="dpr-remove-btn" onclick="remove_dpr_asset(' + idx + ')">✕</button></div>';
	});
	$('#dpr-assets-list').html(html);
	$('.asset-hours').off('input').on('input', function () {
		const idx = $(this).data('idx');
		const hours = parseFloat($(this).val()) || 8;
		dpr_selected_assets[idx].hours = hours;
		// Calculate using hourly rate: cost = rate_per_hour × hours
		if (dpr_selected_assets[idx].rate_per_hour) {
			dpr_selected_assets[idx].amount = dpr_selected_assets[idx].rate_per_hour * hours;
		} else {
			// Fallback for backward compat
			dpr_selected_assets[idx].amount = dpr_selected_assets[idx].rate_per_day * (hours / 8);
		}
		render_assets_list();
		update_dpr_totals();
	});
}

function render_expenses_list() {
	let html = dpr_selected_expenses.length === 0
		? '<div class="dpr-empty">No expenses added. Select an expense type above to add.</div>'
		: '';
	dpr_selected_expenses.forEach((exp, idx) => {
		html += '<div class="dpr-item-card"><div class="dpr-item-info"><div class="dpr-item-name">' + exp.expense_type + '</div>' + (exp.description ? '<div class="dpr-item-sub">' + exp.description + '</div>' : '') + '</div><div class="dpr-item-amount">' + format_currency(exp.amount) + '</div><button type="button" class="dpr-remove-btn" onclick="remove_dpr_expense(' + idx + ')">✕</button></div>';
	});
	$('#dpr-expenses-list').html(html);
}

function render_overheads_list() {
	let html = dpr_selected_overheads.length === 0
		? '<div class="dpr-empty">No overheads added. Select an account above to add.</div>'
		: '';
	dpr_selected_overheads.forEach((ovh, idx) => {
		html += '<div class="dpr-item-card"><div class="dpr-item-info"><div class="dpr-item-name">' + ovh.account_name + '</div>' + (ovh.description ? '<div class="dpr-item-sub">' + ovh.description + '</div>' : '') + '</div><div class="dpr-item-amount">' + format_currency(ovh.amount) + '</div><button type="button" class="dpr-remove-btn" onclick="remove_dpr_overhead(' + idx + ')">✕</button></div>';
	});
	$('#dpr-overheads-list').html(html);
}

window.remove_dpr_employee = function (idx) { dpr_selected_employees.splice(idx, 1); render_employees_list(); update_dpr_totals(); };
window.remove_dpr_material = function (idx) { dpr_selected_materials.splice(idx, 1); render_materials_list(); update_dpr_totals(); };
window.remove_dpr_asset = function (idx) { dpr_selected_assets.splice(idx, 1); render_assets_list(); update_dpr_totals(); };
window.remove_dpr_expense = function (idx) { dpr_selected_expenses.splice(idx, 1); render_expenses_list(); update_dpr_totals(); };
window.remove_dpr_overhead = function (idx) { dpr_selected_overheads.splice(idx, 1); render_overheads_list(); update_dpr_totals(); };

function update_dpr_totals(d) {
	const labourTotal = dpr_selected_employees.reduce((sum, e) => sum + flt(e.amount), 0);
	const materialTotal = dpr_selected_materials.reduce((sum, m) => sum + flt(m.amount), 0);
	const assetTotal = dpr_selected_assets.reduce((sum, a) => sum + flt(a.amount), 0);
	const expenseTotal = dpr_selected_expenses.reduce((sum, e) => sum + flt(e.amount), 0);
	const overheadTotal = dpr_selected_overheads.reduce((sum, o) => sum + flt(o.amount), 0);
	const subcontractTotal = d ? flt(d.get_value('subcontract_cost')) : flt($('[data-fieldname="subcontract_cost"] input').val());
	const grandTotal = labourTotal + materialTotal + assetTotal + expenseTotal + overheadTotal + subcontractTotal;

	// Use simple number formatting for totals display (not HTML)
	const fmt = (val) => frappe.format(val, { fieldtype: 'Currency' }, { only_value: true });

	$('#dpr-labour-total').text(fmt(labourTotal));
	$('#dpr-material-total').text(fmt(materialTotal));
	$('#dpr-asset-total').text(fmt(assetTotal));
	$('#dpr-expense-total').text(fmt(expenseTotal));
	$('#dpr-overhead-total').text(fmt(overheadTotal));
	$('#dpr-subcontract-total').text(fmt(subcontractTotal));
	$('#dpr-grand-total').text(fmt(grandTotal));
}

function set_project_site_requirement(d, project) {
	if (!d || !project || !d.get_field('project_sites')) {
		return;
	}

	frappe.db.get_value('Project', project, 'company', (projectRes) => {
		const company = projectRes && projectRes.company;
		if (!company) {
			return;
		}

		frappe.db.get_value('BOQ Settings', { company: company }, 'mandatory_site_location', (settingsRes) => {
			const mandatory = !!(settingsRes && settingsRes.mandatory_site_location);
			d.set_df_property('project_sites', 'reqd', mandatory);
			d.refresh_field('project_sites');
		});
	});
}

function create_dpr_from_dialog(d, project) {
	const values = d.get_values();
	if (!values) return;

	const labourTotal = dpr_selected_employees.reduce((sum, e) => sum + flt(e.amount), 0);
	const materialTotal = dpr_selected_materials.reduce((sum, m) => sum + flt(m.amount), 0);
	const assetTotal = dpr_selected_assets.reduce((sum, a) => sum + flt(a.amount), 0);
	const expenseTotal = dpr_selected_expenses.reduce((sum, e) => sum + flt(e.amount), 0);
	const overheadTotal = dpr_selected_overheads.reduce((sum, o) => sum + flt(o.amount), 0);
	const total = labourTotal + materialTotal + assetTotal + expenseTotal + overheadTotal + flt(values.subcontract_cost);

	if (total <= 0) {
		frappe.show_alert({ message: __('Please add at least one cost entry'), indicator: 'orange' });
		return;
	}

	frappe.call({
		method: 'construction_management.api.dpr_utils.create_dpr_with_details',
		args: {
			project: project,
			boq_item: values.boq_item,
			bill_no: values.bill_no,
			warehouse: values.warehouse || cur_frm?.doc?.site_location,
			project_sites: values.project_sites,
			date: values.date,
			employees: JSON.stringify(dpr_selected_employees),
			assets: JSON.stringify(dpr_selected_assets),
			materials: JSON.stringify(dpr_selected_materials),
			expenses: JSON.stringify(dpr_selected_expenses),
			overheads: JSON.stringify(dpr_selected_overheads),
			subcontract_cost: values.subcontract_cost || 0,
			remarks: values.remarks
		},
		callback: function (r) {
			if (r.message) {
				d.hide();
				// Clear selections on success
				dpr_selected_employees = [];
				dpr_selected_materials = [];
				dpr_selected_assets = [];
				dpr_selected_expenses = [];
				dpr_selected_overheads = [];
				frappe.show_alert({ message: __('DPR {0} created successfully!', [r.message.name]), indicator: 'green' });
				frappe.confirm(__('DPR created. Submit now to create Stock Entries for materials?'),
					function () {
						// Fetch the full document first, then submit
						frappe.call({
							method: 'frappe.client.get',
							args: {
								doctype: 'Daily Progress Record',
								name: r.message.name
							},
							callback: function (getRes) {
								if (getRes.message) {
									frappe.call({
										method: 'frappe.client.submit',
										args: { doc: getRes.message },
										callback: function () {
											frappe.show_alert({ message: __('DPR submitted. Stock entries created.'), indicator: 'green' });
											cur_frm.reload_doc();
										},
										error: function (err) {
											frappe.msgprint(__('Error submitting DPR: ') + (err.message || err));
											cur_frm.reload_doc();
										}
									});
								}
							}
						});
					},
					function () { cur_frm.reload_doc(); }
				);
			}
		}
	});
}

// Override the original create_dpr_quick to use clean version
window.create_dpr_quick = function (project) {
	window.show_dpr_dialog_enhanced(project);
};


// ============================================
// BOQ Task Management Functions
// ============================================

window.view_boq_tasks = function (boq_item) {
	frappe.call({
		method: 'construction_management.api.boq_tasks.get_boq_item_tasks',
		args: { boq_item: boq_item },
		callback: function (r) {
			if (r.message) {
				show_task_tree_dialog(boq_item, r.message);
			}
		}
	});
};

function show_task_tree_dialog(boq_item, data) {
	const boqItemData = data.boq_item || {};
	const hasTasks = data.has_tasks;
	const tasks = data.tasks || [];

	const d = new frappe.ui.Dialog({
		title: __('Tasks - {0}', [boqItemData.description?.substring(0, 50) || boq_item]),
		size: 'large',
		fields: [{ fieldtype: 'HTML', fieldname: 'task_html' }]
	});

	function renderTaskTree() {
		let content = `
			<div class="task-tree-container">
				<div class="task-header">
					<div class="task-header-info">
						<h4>${boqItemData.description || 'BOQ Item'}</h4>
						<div class="task-meta">
							<span><strong>Qty:</strong> ${format_number(boqItemData.total_qty)} ${boqItemData.unit || ''}</span>
							<span><strong>Amount:</strong> ${format_currency(boqItemData.total_amount)}</span>
						</div>
					</div>
					<div class="task-header-actions">
						${!hasTasks ? `
							<button class="btn btn-primary btn-sm" onclick="create_task_for_boq('${boq_item}', this)">
								<i class="fa fa-plus"></i> Create Task
							</button>
						` : `
							<button class="btn btn-success btn-sm" onclick="add_child_task('${data.linked_task}', '${boqItemData.project}', this)">
								<i class="fa fa-plus"></i> Add Sub-Task
							</button>
						`}
					</div>
				</div>
		`;

		if (hasTasks && tasks.length > 0) {
			content += `<div class="task-tree">${renderTaskNodes(tasks)}</div>`;
		} else {
			content += `
				<div class="no-tasks-message">
					<i class="fa fa-tasks" style="font-size: 48px; color: #ccc; margin-bottom: 15px;"></i>
					<p>No tasks linked to this BOQ Item yet.</p>
					<p class="text-muted">Click "Create Task" to create a group task for this BOQ Item.</p>
				</div>
			`;
		}

		content += `</div>${getTaskTreeStyles()}`;
		d.fields_dict.task_html.$wrapper.html(content);
	}

	function renderTaskNodes(nodes, level = 0) {
		let html = '';
		for (const task of nodes) {
			const statusClass = getTaskStatusClass(task.status);
			const progressWidth = Math.min(100, Math.max(0, task.progress || 0));
			const hasChildren = task.children && task.children.length > 0;

			html += `
				<div class="task-node" data-task="${task.name}" data-level="${level}">
					<div class="task-node-content" style="padding-left: ${level * 24 + 12}px;">
						${hasChildren ? `
							<span class="task-toggle" onclick="toggleTaskChildren(this)">
								<i class="fa fa-chevron-down"></i>
							</span>
						` : `<span class="task-toggle-placeholder"></span>`}
						<div class="task-info">
							<div class="task-subject">
								<a href="/app/task/${task.name}" target="_blank">${task.subject}</a>
								${task.is_group ? '<span class="badge badge-info">Group</span>' : ''}
							</div>
							<div class="task-details">
								${task.exp_start_date ? `<span><i class="fa fa-calendar"></i> ${task.exp_start_date}</span>` : ''}
								${task.exp_end_date ? `<span>→ ${task.exp_end_date}</span>` : ''}
							</div>
						</div>
						<div class="task-progress-container">
							<div class="progress-bar-wrapper">
								<div class="progress-bar-mini">
									<div class="progress-fill" data-task="${task.name}" style="width: ${progressWidth}%"></div>
								</div>
								<input type="range" class="progress-slider" data-task="${task.name}" 
									min="0" max="100" value="${progressWidth}" 
									onchange="updateTaskProgress('${task.name}', this.value, this)"
									oninput="previewTaskProgress('${task.name}', this.value, this)">
							</div>
							<input type="number" class="progress-input" data-task="${task.name}" 
								min="0" max="100" value="${progressWidth}" 
								onchange="updateTaskProgress('${task.name}', this.value, this)">
							<span class="progress-percent">%</span>
						</div>
						<div class="task-status">
							<select class="status-select ${statusClass}" onchange="updateTaskStatusWithProgress('${task.name}', this.value, this)">
								<option value="Open" ${task.status === 'Open' ? 'selected' : ''}>Open</option>
								<option value="Working" ${task.status === 'Working' ? 'selected' : ''}>Working</option>
								<option value="Pending Review" ${task.status === 'Pending Review' ? 'selected' : ''}>Pending Review</option>
								<option value="Overdue" ${task.status === 'Overdue' ? 'selected' : ''}>Overdue</option>
								<option value="Completed" ${task.status === 'Completed' ? 'selected' : ''}>Completed</option>
								<option value="Cancelled" ${task.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
							</select>
						</div>
						<div class="task-actions">
							<button class="btn btn-xs btn-default" onclick="add_child_task('${task.name}', '${boqItemData.project}', this)" title="Add Sub-Task">
								<i class="fa fa-plus"></i>
							</button>
							<button class="btn btn-xs btn-default" onclick="window.open('/app/task/${task.name}', '_blank')" title="Open Task">
								<i class="fa fa-external-link"></i>
							</button>
						</div>
					</div>
					${hasChildren ? `<div class="task-children">${renderTaskNodes(task.children, level + 1)}</div>` : ''}
				</div>
			`;
		}
		return html;
	}

	renderTaskTree();

	// Fix: Ensure proper cleanup when dialog is closed
	d.onhide = function () {
		cleanup_modal_and_restore_dashboard();
	};
	d.show();

	// Store dialog reference for refresh
	window._current_task_dialog = d;
	window._current_boq_item = boq_item;
}

function getTaskStatusClass(status) {
	switch (status) {
		case 'Completed': return 'status-completed';
		case 'Working': return 'status-working';
		case 'Pending Review': return 'status-pending';
		case 'Overdue': return 'status-overdue';
		case 'Cancelled': return 'status-cancelled';
		default: return 'status-open';
	}
}

function getTaskTreeStyles() {
	return `<style>
		.task-tree-container { padding: 0; }
		.task-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; margin-bottom: 16px; }
		.task-header h4 { margin: 0 0 8px 0; font-size: 15px; }
		.task-meta { font-size: 12px; opacity: 0.9; }
		.task-meta span { margin-right: 16px; }
		.task-tree { border: 1px solid #e9ecef; border-radius: 8px; overflow: hidden; }
		.task-node { border-bottom: 1px solid #f0f0f0; }
		.task-node:last-child { border-bottom: none; }
		.task-node-content { display: flex; align-items: center; padding: 12px; gap: 12px; transition: background 0.2s; }
		.task-node-content:hover { background: #f8f9fa; }
		.task-toggle { cursor: pointer; width: 20px; text-align: center; color: #6c757d; }
		.task-toggle-placeholder { width: 20px; }
		.task-toggle i { transition: transform 0.2s; }
		.task-node.collapsed .task-toggle i { transform: rotate(-90deg); }
		.task-node.collapsed .task-children { display: none; }
		.task-info { flex: 1; min-width: 0; }
		.task-subject { font-weight: 500; margin-bottom: 2px; }
		.task-subject a { color: #333; text-decoration: none; }
		.task-subject a:hover { color: #5e64ff; }
		.task-subject .badge { font-size: 10px; margin-left: 8px; padding: 2px 6px; }
		.task-details { font-size: 11px; color: #6c757d; }
		.task-details span { margin-right: 8px; }
		.task-progress-container { display: flex; align-items: center; gap: 6px; width: 140px; }
		.progress-bar-wrapper { position: relative; flex: 1; }
		.progress-bar-mini { height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden; }
		.progress-fill { height: 100%; background: linear-gradient(90deg, #28a745, #20c997); transition: width 0.2s; }
		.progress-slider { position: absolute; top: 0; left: 0; width: 100%; height: 8px; opacity: 0; cursor: pointer; margin: 0; }
		.progress-input { width: 40px; padding: 2px 4px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px; text-align: center; }
		.progress-input:focus { outline: none; border-color: #5e64ff; }
		.progress-percent { font-size: 11px; color: #6c757d; }
		.task-status { width: 130px; }
		.status-select { width: 100%; padding: 4px 8px; border-radius: 4px; border: 1px solid #ddd; font-size: 12px; cursor: pointer; }
		.status-select.status-completed { background: #d4edda; border-color: #28a745; }
		.status-select.status-working { background: #cce5ff; border-color: #007bff; }
		.status-select.status-pending { background: #fff3cd; border-color: #ffc107; }
		.status-select.status-overdue { background: #f8d7da; border-color: #dc3545; }
		.status-select.status-cancelled { background: #e2e3e5; border-color: #6c757d; }
		.task-actions { display: flex; gap: 4px; }
		.task-children { background: #fafafa; }
		.no-tasks-message { text-align: center; padding: 40px 20px; color: #6c757d; }
	</style>`;
}

window.toggleTaskChildren = function (el) {
	const node = $(el).closest('.task-node');
	node.toggleClass('collapsed');
};

// Preview progress while dragging slider (no server call)
window.previewTaskProgress = function (task, progress, sliderEl) {
	const $node = $(sliderEl).closest('.task-node');
	const progressValue = Math.min(100, Math.max(0, parseInt(progress) || 0));

	// Update visual elements
	$node.find(`.progress-fill[data-task="${task}"]`).css('width', progressValue + '%');
	$node.find(`.progress-input[data-task="${task}"]`).val(progressValue);
};

// Update progress on server
window.updateTaskProgress = function (task, progress, inputEl) {
	const progressValue = Math.min(100, Math.max(0, parseInt(progress) || 0));
	const $node = $(inputEl).closest('.task-node');

	// Update all visual elements immediately
	$node.find(`.progress-fill[data-task="${task}"]`).css('width', progressValue + '%');
	$node.find(`.progress-slider[data-task="${task}"]`).val(progressValue);
	$node.find(`.progress-input[data-task="${task}"]`).val(progressValue);

	// Determine status based on progress
	let newStatus = null;
	if (progressValue === 100) {
		newStatus = 'Completed';
	} else if (progressValue > 0) {
		// Only change to Working if currently Open
		const currentStatus = $node.find('.status-select').val();
		if (currentStatus === 'Open') {
			newStatus = 'Working';
		}
	}

	frappe.call({
		method: 'construction_management.api.boq_tasks.update_task_status',
		args: {
			task: task,
			status: newStatus,
			progress: progressValue
		},
		callback: function (r) {
			if (r.message) {
				frappe.show_alert({ message: __('Progress updated to {0}%', [progressValue]), indicator: 'green' });

				// Update status dropdown if status changed
				if (r.message.status) {
					const $select = $node.find('.status-select');
					$select.val(r.message.status);
					$select.removeClass('status-open status-working status-pending status-overdue status-completed status-cancelled');
					$select.addClass(getTaskStatusClass(r.message.status));
				}
			}
		}
	});
};

// Update status with automatic progress adjustment
window.updateTaskStatusWithProgress = function (task, status, selectEl) {
	const $node = $(selectEl).closest('.task-node');
	let progress = null;

	// Auto-set progress based on status
	if (status === 'Completed') {
		progress = 100;
	} else if (status === 'Open') {
		progress = 0;
	} else if (status === 'Cancelled') {
		progress = 0;
	}

	frappe.call({
		method: 'construction_management.api.boq_tasks.update_task_status',
		args: { task: task, status: status, progress: progress },
		callback: function (r) {
			if (r.message) {
				frappe.show_alert({ message: __('Task status updated'), indicator: 'green' });

				// Update select styling
				const $select = $(selectEl);
				$select.removeClass('status-open status-working status-pending status-overdue status-completed status-cancelled');
				$select.addClass(getTaskStatusClass(status));

				// Update progress display
				const newProgress = r.message.progress || 0;
				$node.find(`.progress-fill[data-task="${task}"]`).css('width', newProgress + '%');
				$node.find(`.progress-slider[data-task="${task}"]`).val(newProgress);
				$node.find(`.progress-input[data-task="${task}"]`).val(newProgress);
			}
		}
	});
};

// Keep old function for backward compatibility
window.updateTaskStatus = function (task, status, selectEl) {
	window.updateTaskStatusWithProgress(task, status, selectEl);
};

window.create_task_for_boq = function (boq_item, btnEl) {
	const d = new frappe.ui.Dialog({
		title: __('Create Task for BOQ Item'),
		fields: [
			{ fieldname: 'start_date', label: 'Start Date', fieldtype: 'Date' },
			{ fieldname: 'end_date', label: 'End Date', fieldtype: 'Date' }
		],
		primary_action_label: __('Create'),
		primary_action: function (values) {
			frappe.call({
				method: 'construction_management.api.boq_tasks.create_task_for_existing_boq_item',
				args: {
					boq_item: boq_item,
					start_date: values.start_date,
					end_date: values.end_date
				},
				callback: function (r) {
					if (r.message) {
						d.hide();
						frappe.show_alert({ message: __('Task {0} created', [r.message.task]), indicator: 'green' });
						// Refresh the task dialog
						if (window._current_task_dialog) {
							window._current_task_dialog.hide();
							view_boq_tasks(boq_item);
						}
					}
				}
			});
		}
	});
	d.show();
};

window.add_child_task = function (parent_task, project, btnEl) {
	const d = new frappe.ui.Dialog({
		title: __('Add Sub-Task'),
		fields: [
			{ fieldname: 'subject', label: 'Task Name', fieldtype: 'Data', reqd: 1 },
			{ fieldtype: 'Column Break' },
			{ fieldname: 'start_date', label: 'Start Date', fieldtype: 'Date' },
			{ fieldname: 'end_date', label: 'End Date', fieldtype: 'Date' }
		],
		primary_action_label: __('Create'),
		primary_action: function (values) {
			frappe.call({
				method: 'construction_management.api.boq_tasks.create_child_task',
				args: {
					parent_task: parent_task,
					subject: values.subject,
					project: project,
					start_date: values.start_date,
					end_date: values.end_date
				},
				callback: function (r) {
					if (r.message) {
						d.hide();
						frappe.show_alert({ message: __('Sub-task created'), indicator: 'green' });
						// Refresh the task dialog
						if (window._current_task_dialog && window._current_boq_item) {
							window._current_task_dialog.hide();
							view_boq_tasks(window._current_boq_item);
						}
					}
				}
			});
		}
	});
	d.show();
};

// ============================================
// Resource Planner Functions
// ============================================

window.open_resource_planner = function (project, filters = {}) {
	// Store current filters globally for the dialog
	window._rpFilters = filters;
	window._rpProject = project;

	frappe.call({
		method: 'construction_management.api.resource_planner.get_project_resource_summary',
		args: {
			project: project,
			employee: filters.employee || '',
			start_date: filters.start_date || '',
			end_date: filters.end_date || '',
			page: filters.page || 1,
			page_size: filters.page_size || 10
		},
		callback: function (r) {
			if (r.message) {
				show_resource_planner_dialog(project, r.message, filters);
			}
		}
	});
};

function show_resource_planner_dialog(project, data, filters = {}) {
	// Close existing dialog if open
	if (window._resourcePlannerDialog) {
		window._resourcePlannerDialog.hide();
	}

	const d = new frappe.ui.Dialog({
		title: __('Resource Planner - {0}', [project]),
		size: 'extra-large',
		fields: [
			{
				fieldname: 'filter_section',
				fieldtype: 'Section Break',
				label: 'Filters'
			},
			{
				fieldname: 'filter_employee',
				fieldtype: 'Link',
				label: 'Employee',
				options: 'Employee',
				default: filters.employee || ''
			},
			{
				fieldtype: 'Column Break'
			},
			{
				fieldname: 'filter_start_date',
				fieldtype: 'Date',
				label: 'Start Date',
				default: filters.start_date || ''
			},
			{
				fieldtype: 'Column Break'
			},
			{
				fieldname: 'filter_end_date',
				fieldtype: 'Date',
				label: 'End Date',
				default: filters.end_date || ''
			},
			{
				fieldtype: 'Column Break'
			},
			{
				fieldname: 'filter_page_size',
				fieldtype: 'Select',
				label: 'Page Size',
				options: '5\n10\n20\n50\n100',
				default: String(filters.page_size || 10)
			},
			{
				fieldname: 'data_section',
				fieldtype: 'Section Break',
				label: 'Resource Allocations'
			},
			{
				fieldtype: 'HTML',
				fieldname: 'planner_html'
			}
		],
		primary_action_label: __('Apply Filters'),
		primary_action: function () {
			const newFilters = {
				employee: d.get_value('filter_employee') || '',
				start_date: d.get_value('filter_start_date') || '',
				end_date: d.get_value('filter_end_date') || '',
				page_size: parseInt(d.get_value('filter_page_size')) || 10,
				page: 1
			};
			d.hide();
			open_resource_planner(project, newFilters);
		},
		secondary_action_label: __('Clear Filters'),
		secondary_action: function () {
			d.hide();
			open_resource_planner(project, { page: 1, page_size: 10 });
		}
	});

	const pagination = data.pagination || {};
	const currentPage = pagination.page || 1;
	const totalPages = pagination.total_pages || 1;
	const pageSize = filters.page_size || 10;

	let employeeRows = '';
	if (data.by_employee && data.by_employee.length > 0) {
		employeeRows = data.by_employee.map(emp => `
			<tr>
				<td>
					<strong>${emp.employee_name || emp.employee}</strong>
					<br><small class="text-muted">${emp.designation || ''}</small>
				</td>
				<td class="text-right">${emp.total_hours.toFixed(1)} hrs</td>
				<td>${emp.assignments.map(a => `
					<div class="assignment-chip">
						<span class="assignment-dates">${a.start_date} → ${a.end_date}</span>
						${a.bill_no ? `<span class="assignment-bill">${a.bill_no}</span>` : ''}
						<button class="assignment-delete" data-name="${a.name}" data-project="${project}" title="Delete">×</button>
					</div>
				`).join('')}</td>
			</tr>
		`).join('');
	} else {
		employeeRows = '<tr><td colspan="3" class="text-center text-muted py-4">No resources allocated yet</td></tr>';
	}

	// Build pagination controls - always show
	const paginationHtml = `
		<div class="pagination-footer">
			<div class="pagination-info-left">
				Showing ${data.by_employee.length} of ${data.total_employees} employees
			</div>
			<div class="pagination-controls">
				<button class="btn btn-xs btn-default pagination-btn" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>
					<i class="fa fa-chevron-left"></i> Prev
				</button>
				<span class="pagination-info">Page ${currentPage} of ${totalPages}</span>
				<button class="btn btn-xs btn-default pagination-btn" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>
					Next <i class="fa fa-chevron-right"></i>
				</button>
			</div>
		</div>
	`;

	d.fields_dict.planner_html.$wrapper.html(`
		<div class="resource-planner-container">
			<div class="planner-header">
				<div class="planner-stats">
					<div class="stat-card">
						<span class="stat-value">${data.total_employees}</span>
						<span class="stat-label">Total Employees</span>
					</div>
					<div class="stat-card">
						<span class="stat-value">${data.total_hours.toFixed(0)}</span>
						<span class="stat-label">Total Hours</span>
					</div>
				</div>
				<div class="planner-actions">
					<button class="btn btn-primary btn-sm add-resource-btn">
						<i class="fa fa-plus"></i> Add Resource
					</button>
					<button class="btn btn-default btn-sm view-all-btn">
						<i class="fa fa-list"></i> View All
					</button>
				</div>
			</div>
			
			<div class="resource-table-wrapper">
				<table class="table table-bordered resource-table">
					<thead>
						<tr>
							<th style="width: 200px;">Employee</th>
							<th class="text-right" style="width: 100px;">Hours</th>
							<th>Assignments</th>
						</tr>
					</thead>
					<tbody>${employeeRows}</tbody>
				</table>
			</div>
			
			${paginationHtml}
		</div>
		<style>
			.resource-planner-container { padding: 0; }
			.planner-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; color: white; }
			.planner-stats { display: flex; gap: 32px; }
			.stat-card { text-align: center; }
			.stat-value { display: block; font-size: 28px; font-weight: 700; }
			.stat-label { font-size: 12px; opacity: 0.9; }
			.planner-actions { display: flex; gap: 8px; }
			.planner-actions .btn { border: 1px solid rgba(255,255,255,0.3); }
			.planner-actions .btn-primary { background: rgba(255,255,255,0.2); border-color: rgba(255,255,255,0.3); }
			.planner-actions .btn-default { background: rgba(255,255,255,0.1); color: white; }
			.resource-table-wrapper { max-height: 350px; overflow-y: auto; border: 1px solid #e9ecef; border-radius: 8px; margin-bottom: 16px; }
			.resource-table { margin: 0; }
			.resource-table thead th { position: sticky; top: 0; background: #f8f9fa; z-index: 1; border-bottom: 2px solid #dee2e6; }
			.resource-table tbody tr:hover { background: #f8f9fa; }
			.assignment-chip { display: inline-flex; align-items: center; background: #e9ecef; padding: 6px 10px; border-radius: 6px; margin: 3px; font-size: 12px; gap: 8px; }
			.assignment-dates { color: #495057; font-weight: 500; }
			.assignment-bill { background: #5e64ff; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
			.assignment-delete { background: none; border: none; color: #dc3545; cursor: pointer; font-size: 16px; padding: 0 4px; line-height: 1; font-weight: bold; }
			.assignment-delete:hover { color: #a71d2a; transform: scale(1.2); }
			.pagination-footer { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef; }
			.pagination-info-left { font-size: 13px; color: #6c757d; }
			.pagination-controls { display: flex; align-items: center; gap: 12px; }
			.pagination-info { font-size: 13px; color: #495057; font-weight: 500; }
			.pagination-btn { min-width: 70px; }
			.py-4 { padding-top: 24px !important; padding-bottom: 24px !important; }
		</style>
	`);

	// Attach event handlers using jQuery delegation
	const $wrapper = d.fields_dict.planner_html.$wrapper;

	$wrapper.find('.add-resource-btn').on('click', function () {
		d.hide();
		add_resource_allocation(project);
	});

	$wrapper.find('.view-all-btn').on('click', function () {
		d.hide();
		frappe.set_route('List', 'Resource Planner', { project: project });
	});

	$wrapper.find('.assignment-delete').on('click', function () {
		const name = $(this).data('name');
		const proj = $(this).data('project');
		frappe.confirm(__('Delete this resource allocation?'), function () {
			frappe.call({
				method: 'construction_management.api.resource_planner.delete_resource_allocation',
				args: { name: name },
				callback: function (r) {
					if (r.message && r.message.success) {
						frappe.show_alert({ message: __('Resource allocation deleted'), indicator: 'green' });
						d.hide();
						open_resource_planner(proj, filters);
					}
				}
			});
		});
	});

	$wrapper.find('.pagination-btn').on('click', function () {
		if ($(this).prop('disabled')) return;
		const newPage = parseInt($(this).data('page'));
		const newFilters = Object.assign({}, filters, { page: newPage });
		d.hide();
		open_resource_planner(project, newFilters);
	});

	// Store dialog reference
	window._resourcePlannerDialog = d;

	// Fix: Ensure proper cleanup when dialog is closed
	d.onhide = function () {
		cleanup_modal_and_restore_dashboard();
	};
	d.show();
	ensure_dashboard_visible();
}

window.add_resource_allocation = function (project) {
	// Store selected employees
	let selectedEmployees = [];

	const d = new frappe.ui.Dialog({
		title: __('Add Resource Allocation'),
		size: 'large',
		fields: [
			{
				fieldname: 'employees_section',
				fieldtype: 'Section Break',
				label: 'Select Employees'
			},
			{
				fieldname: 'selected_employees_html',
				fieldtype: 'HTML',
				label: 'Selected Employees'
			},
			{
				fieldname: 'employee_search',
				label: 'Search & Add Employee',
				fieldtype: 'Link',
				options: 'Employee',
				get_query: () => ({ filters: { status: 'Active' } }),
				change: function () {
					const emp = d.get_value('employee_search');
					if (emp && !selectedEmployees.find(e => e.name === emp)) {
						// Fetch employee details
						frappe.db.get_value('Employee', emp, ['employee_name', 'designation'])
							.then(r => {
								if (r.message) {
									selectedEmployees.push({
										name: emp,
										employee_name: r.message.employee_name,
										designation: r.message.designation || ''
									});
									updateSelectedEmployeesDisplay();
									d.set_value('employee_search', '');
								}
							});
					}
				}
			},
			{
				fieldname: 'assignment_section',
				fieldtype: 'Section Break',
				label: 'Assignment Details'
			},
			{
				fieldname: 'bill_no',
				label: 'Bill No',
				fieldtype: 'Link',
				options: 'BOQ Bill',
				get_query: () => ({
					query: 'construction_management.api.resource_planner.get_bills_for_project',
					filters: { project: project }
				})
			},
			{
				fieldname: 'boq_item',
				label: 'BOQ Item',
				fieldtype: 'Link',
				options: 'BOQ Item',
				depends_on: 'bill_no',
				get_query: function () {
					return {
						query: 'construction_management.api.resource_planner.get_boq_items_for_bill',
						filters: { bill_no: d.get_value('bill_no') }
					};
				}
			},
			{ fieldtype: 'Column Break' },
			{
				fieldname: 'start_date',
				label: 'Start Date',
				fieldtype: 'Date',
				reqd: 1,
				default: frappe.datetime.get_today()
			},
			{
				fieldname: 'end_date',
				label: 'End Date',
				fieldtype: 'Date',
				reqd: 1
			},
			{
				fieldname: 'hours_per_day',
				label: 'Hours Per Day',
				fieldtype: 'Float',
				default: 8
			},
			{
				fieldname: 'notes_section',
				fieldtype: 'Section Break',
				label: 'Notes'
			},
			{
				fieldname: 'notes',
				label: 'Notes',
				fieldtype: 'Small Text'
			}
		],
		primary_action_label: __('Create'),
		primary_action: function (values) {
			if (selectedEmployees.length === 0) {
				frappe.msgprint(__('Please select at least one employee'));
				return;
			}

			const employeeIds = selectedEmployees.map(e => e.name);

			frappe.call({
				method: 'construction_management.api.resource_planner.create_multiple_resource_allocations',
				args: {
					project: project,
					employees: JSON.stringify(employeeIds),
					start_date: values.start_date,
					end_date: values.end_date,
					bill_no: values.bill_no,
					boq_item: values.boq_item,
					hours_per_day: values.hours_per_day,
					notes: values.notes
				},
				callback: function (r) {
					if (r.message) {
						d.hide();
						frappe.show_alert({
							message: __('Created {0} resource allocation(s)', [r.message.count]),
							indicator: 'green'
						});
						// Refresh the resource planner dialog
						open_resource_planner(project);
					}
				}
			});
		}
	});

	function updateSelectedEmployeesDisplay() {
		const container = d.fields_dict.selected_employees_html.$wrapper;

		if (selectedEmployees.length === 0) {
			container.html(`
				<div class="selected-employees-empty">
					<p class="text-muted">No employees selected. Use the search field above to add employees.</p>
				</div>
			`);
		} else {
			const chips = selectedEmployees.map((emp, idx) => `
				<div class="employee-chip" data-idx="${idx}">
					<div class="chip-content">
						<span class="chip-name">${emp.employee_name}</span>
						<span class="chip-designation">${emp.designation || 'No Designation'}</span>
						<span class="chip-id">${emp.name}</span>
					</div>
					<button class="chip-remove" onclick="removeSelectedEmployee(${idx})" title="Remove">
						<i class="fa fa-times"></i>
					</button>
				</div>
			`).join('');

			container.html(`
				<div class="selected-employees-container">
					<div class="selected-count">${selectedEmployees.length} employee(s) selected</div>
					<div class="employee-chips">${chips}</div>
				</div>
				<style>
					.selected-employees-container { margin-bottom: 10px; }
					.selected-count { font-size: 12px; color: #6c757d; margin-bottom: 8px; font-weight: 500; }
					.employee-chips { display: flex; flex-wrap: wrap; gap: 8px; }
					.employee-chip { 
						display: flex; 
						align-items: center; 
						background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
						border: 1px solid #a5b4fc;
						border-radius: 8px; 
						padding: 8px 12px;
						gap: 10px;
					}
					.chip-content { display: flex; flex-direction: column; }
					.chip-name { font-weight: 600; font-size: 13px; color: #1e40af; }
					.chip-designation { font-size: 11px; color: #6366f1; }
					.chip-id { font-size: 10px; color: #9ca3af; }
					.chip-remove { 
						background: none; 
						border: none; 
						color: #dc2626; 
						cursor: pointer; 
						padding: 4px;
						border-radius: 4px;
						transition: background 0.2s;
					}
					.chip-remove:hover { background: #fee2e2; }
					.selected-employees-empty { 
						padding: 20px; 
						text-align: center; 
						background: #f8fafc; 
						border-radius: 8px;
						border: 1px dashed #e2e8f0;
					}
				</style>
			`);
		}
	}

	// Make remove function globally accessible
	window.removeSelectedEmployee = function (idx) {
		selectedEmployees.splice(idx, 1);
		updateSelectedEmployeesDisplay();
	};

	// Fix: Ensure proper cleanup when dialog is closed
	d.onhide = function () {
		cleanup_modal_and_restore_dashboard();
	};
	d.show();

	// Initial display
	updateSelectedEmployeesDisplay();
};

// ============================================
// BOQ Template Upload (Task 14.4)
// Requirements: 11.1, 11.5, 11.6
// ============================================

window.upload_boq_template = function (project) {
	const d = new frappe.ui.Dialog({
		title: __('Upload BOQ Template'),
		size: 'large',
		fields: [
			{
				fieldtype: 'HTML',
				fieldname: 'template_info',
				options: `
					<div class="template-upload-info">
						<div class="info-header">
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="10"></circle>
								<line x1="12" y1="16" x2="12" y2="12"></line>
								<line x1="12" y1="8" x2="12.01" y2="8"></line>
							</svg>
							<span>Template Format</span>
						</div>
						<p>Upload an Excel file with the following columns:</p>
						<div class="columns-list">
							<div class="column-group required">
								<strong>Required:</strong>
								<span class="column-tag">Bill No</span>
								<span class="column-tag">Description</span>
								<span class="column-tag">Unit</span>
								<span class="column-tag">Quantity</span>
								<span class="column-tag">Rate</span>
							</div>
							<div class="column-group optional">
								<strong>Optional:</strong>
								<span class="column-tag">Item Code</span>
								<span class="column-tag">Estimated Material Cost</span>
								<span class="column-tag">Estimated Labour Cost</span>
								<span class="column-tag">Estimated Subcontract Cost</span>
								<span class="column-tag">Estimated Asset Cost</span>
								<span class="column-tag">Estimated Other Cost</span>
							</div>
						</div>
						<button class="btn btn-xs btn-default download-template-btn" onclick="download_boq_template()">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
								<polyline points="7 10 12 15 17 10"></polyline>
								<line x1="12" y1="15" x2="12" y2="3"></line>
							</svg>
							Download Sample Template
						</button>
					</div>
					<style>
						.template-upload-info { 
							background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
							border: 1px solid #bae6fd;
							border-radius: 8px;
							padding: 16px;
							margin-bottom: 16px;
						}
						.info-header { 
							display: flex; 
							align-items: center; 
							gap: 8px; 
							font-weight: 600; 
							color: #0369a1;
							margin-bottom: 8px;
						}
						.template-upload-info p { margin: 0 0 12px 0; color: #374151; font-size: 13px; }
						.columns-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
						.column-group { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; }
						.column-group strong { min-width: 70px; color: #374151; }
						.column-tag { 
							background: white; 
							border: 1px solid #d1d5db; 
							border-radius: 4px; 
							padding: 2px 8px; 
							font-size: 11px;
							color: #4b5563;
						}
						.column-group.required .column-tag { border-color: #f59e0b; background: #fffbeb; color: #92400e; }
						.column-group.optional .column-tag { border-color: #10b981; background: #ecfdf5; color: #065f46; }
						.download-template-btn { 
							display: inline-flex; 
							align-items: center; 
							gap: 6px;
							margin-top: 8px;
						}
					</style>
				`
			},
			{
				fieldtype: 'Attach',
				fieldname: 'template_file',
				label: __('Select Excel File'),
				reqd: 1,
				options: {
					restrictions: {
						allowed_file_types: ['.xlsx', '.xls']
					}
				}
			},
			{
				fieldtype: 'HTML',
				fieldname: 'upload_result',
				options: '<div id="upload-result-container"></div>'
			}
		],
		primary_action_label: __('Upload & Create'),
		primary_action: function (values) {
			if (!values.template_file) {
				frappe.msgprint(__('Please select a file to upload'));
				return;
			}

			d.disable_primary_action();
			$('#upload-result-container').html(`
				<div class="upload-progress">
					<div class="spinner-border spinner-border-sm" role="status"></div>
					<span>Processing template...</span>
				</div>
				<style>
					.upload-progress { 
						display: flex; 
						align-items: center; 
						gap: 10px; 
						padding: 12px; 
						background: #f3f4f6; 
						border-radius: 6px;
						color: #4b5563;
					}
				</style>
			`);

			frappe.call({
				method: 'construction_management.api.template_upload.upload_boq_template',
				args: {
					project: project,
					file_url: values.template_file
				},
				callback: function (r) {
					d.enable_primary_action();

					if (r.message) {
						const result = r.message;

						if (result.success) {
							$('#upload-result-container').html(`
								<div class="upload-success">
									<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
										<polyline points="22 4 12 14.01 9 11.01"></polyline>
									</svg>
									<div class="success-content">
										<strong>${result.message}</strong>
										<div class="success-details">
											<span>Bills: ${result.bills_created}</span>
											<span>Items: ${result.items_created}</span>
										</div>
									</div>
								</div>
								<style>
									.upload-success { 
										display: flex; 
										align-items: center; 
										gap: 12px; 
										padding: 16px; 
										background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
										border: 1px solid #10b981;
										border-radius: 8px;
										color: #065f46;
									}
									.success-content { display: flex; flex-direction: column; gap: 4px; }
									.success-details { display: flex; gap: 16px; font-size: 12px; color: #047857; }
								</style>
							`);

							// Refresh dashboard after successful upload
							setTimeout(() => {
								d.hide();
								cur_frm.reload_doc();
							}, 1500);
						} else {
							// Show errors
							let errorHtml = '';
							if (result.errors && result.errors.length > 0) {
								errorHtml = result.errors.map(e => {
									if (typeof e === 'object') {
										return `<div class="error-item">Row ${e.row}, ${e.column}: ${e.message}</div>`;
									}
									return `<div class="error-item">${e}</div>`;
								}).join('');
							}

							$('#upload-result-container').html(`
								<div class="upload-error">
									<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<circle cx="12" cy="12" r="10"></circle>
										<line x1="15" y1="9" x2="9" y2="15"></line>
										<line x1="9" y1="9" x2="15" y2="15"></line>
									</svg>
									<div class="error-content">
										<strong>${result.message || 'Upload failed'}</strong>
										<div class="error-list">${errorHtml}</div>
									</div>
								</div>
								<style>
									.upload-error { 
										display: flex; 
										align-items: flex-start; 
										gap: 12px; 
										padding: 16px; 
										background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
										border: 1px solid #ef4444;
										border-radius: 8px;
										color: #991b1b;
									}
									.error-content { display: flex; flex-direction: column; gap: 8px; flex: 1; }
									.error-list { 
										max-height: 150px; 
										overflow-y: auto; 
										font-size: 12px; 
										background: white;
										border-radius: 4px;
										padding: 8px;
									}
									.error-item { 
										padding: 4px 0; 
										border-bottom: 1px solid #fecaca;
										color: #b91c1c;
									}
									.error-item:last-child { border-bottom: none; }
								</style>
							`);
						}
					}
				},
				error: function (r) {
					d.enable_primary_action();
					$('#upload-result-container').html(`
						<div class="upload-error">
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="10"></circle>
								<line x1="15" y1="9" x2="9" y2="15"></line>
								<line x1="9" y1="9" x2="15" y2="15"></line>
							</svg>
							<div class="error-content">
								<strong>Error processing template</strong>
								<p>${r.message || 'An unexpected error occurred'}</p>
							</div>
						</div>
					`);
				}
			});
		}
	});

	d.onhide = function () {
		cleanup_modal_and_restore_dashboard();
	};

	d.show();
};

window.download_boq_template = function () {
	frappe.call({
		method: 'construction_management.api.template_upload.download_template',
		callback: function (r) {
			if (r.message) {
				window.open(r.message);
				frappe.show_alert({ message: __('Template downloaded'), indicator: 'green' });
			}
		}
	});
};

// ============================================
// Full Screen BOQ Management View
// ============================================


window.openFullScreenBOQ = function (project) {
	// Store current state for restoration
	window._boq_fullscreen_state = {
		project: project,
		scrollPosition: window.pageYOffset
	};

	// 1. Immediately request fullscreen and show modal (User Gesture Context)
	showFullScreenBOQModal(project, null, true);

	// 2. Fetch BOQ data for full-screen view
	frappe.call({
		method: 'construction_management.api.boq_tree.get_boq_tree_data',
		args: { project: project },
		callback: function (r) {
			if (r.message && r.message.has_boq) {
				updateFullScreenBOQContent(project, r.message);
			} else {
				frappe.msgprint(__('No BOQ data found for this project'));
				closeFullScreenBOQ();
			}
		}
	});
};

function showFullScreenBOQModal(project, data, isLoading = false) {
	// Apply full-screen specific styles immediately
	applyFullScreenStyles();

	// Create full-screen modal
	const modalContent = isLoading ? `
		<div class="fullscreen-loading">
			<div class="loading-spinner"></div>
			<p>Loading BOQ Management Table...</p>
		</div>` : renderFullScreenBody(project, data);

	const modal = $(`
		<div class="boq-fullscreen-modal" id="boq-fullscreen-modal">
			<div class="fullscreen-header">
				<div class="fullscreen-title">
					<h2>BOQ Management - Full Screen View</h2>
					<span class="project-name">${project}</span>
				</div>
				<div class="fullscreen-actions">
					<button class="btn btn-default btn-sm" onclick="refreshFullScreenBOQ('${project}')">
						<i class="fa fa-refresh"></i> Refresh
					</button>
					<button class="btn btn-default btn-sm close-fullscreen" onclick="closeFullScreenBOQ()">
						<i class="fa fa-times"></i> Close
					</button>
				</div>
			</div>
			<div class="fullscreen-content" id="fullscreen-content-wrapper">
				${modalContent}
			</div>
		</div>
	`);

	// Add to body and show
	$('body').append(modal);
	modal.fadeIn(300);

	// Enable browser full-screen if supported
	if (document.documentElement.requestFullscreen) {
		const request = document.documentElement.requestFullscreen();
		if (request && request.catch) {
			request.catch(() => {
				// Fallback to modal full-screen
				modal.addClass('fallback-fullscreen');
			});
		}
	} else {
		modal.addClass('fallback-fullscreen');
	}

	// Lock body scroll
	$('body').css('overflow', 'hidden');
	$('body').addClass('boq-fullscreen-active');

	// If data provided immediately (not loading), render scripts
	if (!isLoading && data) {
		const container = modal.find('.boq-fullscreen-container');
		if (container.length) {
			render_boq_management_table(container, { doc: { name: project } }, data.bills);
			renderFullScreenScripts(project, data);
		}
	}

	// Store modal reference
	window._fullscreen_modal = modal;
}

function updateFullScreenBOQContent(project, data) {
	if (!data) return;

	const wrapper = $('#fullscreen-content-wrapper');
	wrapper.html(renderFullScreenBody(project, data));

	const container = wrapper.find('.boq-fullscreen-container');
	if (container.length && data.bills) {
		render_boq_management_table(container, { doc: { name: project } }, data.bills);
		renderFullScreenScripts(project, data);
	}
}

function renderFullScreenBody(project, data) {
	return `
		<div class="boq-fullscreen-container"></div>
	`;
}

function renderFullScreenScripts(project, data) {
	const container = $('.boq-fullscreen-container');
	const frm = { doc: { name: project } }; // Mock frm object

	// Apply full-screen specific styles
	applyFullScreenStyles();
	$(document).on('show.bs.modal', '.modal', function () {
		const modal = $(this);
		if ($('#boq-fullscreen-modal').is(':visible')) {
			modal.css('z-index', 10002);
			modal.next('.modal-backdrop').css('z-index', 10001);
		}
	});

	// Fix existing modals and dialogs
	$('.modal, .frappe-dialog').each(function () {
		if ($(this).is(':visible') && $('#boq-fullscreen-modal').is(':visible')) {
			$(this).css('z-index', 10002);
			$(this).next('.modal-backdrop').css('z-index', 10001);
		}
	});

	// Ensure task management dialogs work properly
	$(document).on('DOMNodeInserted', 'body', function (e) {
		const target = $(e.target);
		if (target.hasClass('frappe-dialog') || target.hasClass('modal') || target.closest('.frappe-dialog').length) {
			if ($('#boq-fullscreen-modal').is(':visible')) {
				target.css('z-index', 10002);
				if (target.hasClass('modal')) {
					target.next('.modal-backdrop').css('z-index', 10001);
				}
			}
		}
	});
}

function applyFullScreenStyles() {
	if (!$('#fullscreen-boq-styles').length) {
		$('head').append(`
			<style id="fullscreen-boq-styles">
				/* Full Screen Button Styling */
				.btn-fullscreen-icon {
					background: transparent !important;
					border: 1px solid #d1d5db !important;
					color: #6b7280 !important;
					padding: 8px !important;
					border-radius: 6px !important;
					transition: all 0.2s ease !important;
				}
				
				.btn-fullscreen-icon:hover {
					background: #f3f4f6 !important;
					border-color: #9ca3af !important;
					color: #374151 !important;
					transform: translateY(-1px) !important;
				}
				
				.btn-fullscreen-icon:active {
					transform: translateY(0) !important;
				}
				
				.boq-fullscreen-modal {
					position: fixed;
					top: 0;
					left: 0;
					width: 100vw;
					height: 100vh;
					background: white;
					z-index: 10000 !important;
					display: none;
					flex-direction: column;
				}
				
				/* Robust z-index fix for popups in full screen */
				body.boq-fullscreen-active .modal,
				body.boq-fullscreen-active .frappe-dialog {
					z-index: 10002 !important;
				}
				
				body.boq-fullscreen-active .modal-backdrop {
					z-index: 10001 !important;
				}
				
				body.boq-fullscreen-active .datepicker {
					z-index: 10003 !important;
				}
				
				body.boq-fullscreen-active .awesomplete > ul {
					z-index: 10003 !important;
				}
				
				body.boq-fullscreen-active .flatpickr-calendar {
					z-index: 10003 !important;
				}
				
				.boq-fullscreen-modal.fallback-fullscreen {
					position: fixed !important;
					top: 0 !important;
					left: 0 !important;
					width: 100vw !important;
					height: 100vh !important;
				}
				
				.fullscreen-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					padding: 16px 24px;
					background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
					color: white;
					border-bottom: 1px solid #e5e7eb;
					flex-shrink: 0;
				}
				
				.fullscreen-title h2 {
					margin: 0;
					font-size: 20px;
					font-weight: 600;
				}
				
				.project-name {
					font-size: 14px;
					opacity: 0.9;
					margin-top: 4px;
					display: block;
				}
				
				.fullscreen-actions {
					display: flex;
					gap: 8px;
				}
				
				.fullscreen-actions .btn {
					border: 1px solid rgba(255,255,255,0.3);
					color: white;
					background: rgba(255,255,255,0.1);
				}
				
				.fullscreen-actions .btn:hover {
					background: rgba(255,255,255,0.2);
				}
				
				.fullscreen-content {
					flex: 1;
					overflow: auto;
					padding: 16px 24px;
					position: relative;
				}
				
				.fullscreen-loading {
					display: flex;
					flex-direction: column;
					align-items: center;
					justify-content: center;
					height: 200px;
					color: #6c757d;
				}
				
				.fullscreen-loading .loading-spinner {
					width: 40px;
					height: 40px;
					border: 3px solid #f3f3f3;
					border-top: 3px solid #667eea;
					border-radius: 50%;
					animation: spin 1s linear infinite;
					margin-bottom: 16px;
				}
				
				@keyframes spin {
					0% { transform: rotate(0deg); }
					100% { transform: rotate(360deg); }
				}
				
				/* Full-screen table optimizations */
				.boq-fullscreen-modal .comprehensive-items-table {
					min-width: 100%;
					font-size: 12px;
				}
				
				.boq-fullscreen-modal .comprehensive-table-wrapper {
					overflow-x: auto;
					overflow-y: visible;
				}
				
				/* Responsive column widths for full-screen */
				.boq-fullscreen-modal .col-desc {
					min-width: 200px;
					max-width: 300px;
				}
				
				.boq-fullscreen-modal .col-num {
					width: 90px;
					min-width: 80px;
				}
				
				.boq-fullscreen-modal .col-actions {
					width: 160px;
					min-width: 160px;
				}
				
				/* Larger screens get more space */
				@media (min-width: 1920px) {
					.boq-fullscreen-modal .comprehensive-items-table {
						font-size: 13px;
					}
					
					.boq-fullscreen-modal .col-desc {
						min-width: 250px;
						max-width: 350px;
					}
					
					.boq-fullscreen-modal .col-num {
						width: 100px;
						min-width: 90px;
					}
					
					.boq-fullscreen-modal .col-actions {
						width: 180px;
						min-width: 180px;
					}
				}
				
				/* Medium screens optimization */
				@media (min-width: 1366px) and (max-width: 1919px) {
					.boq-fullscreen-modal .col-desc {
						min-width: 180px;
						max-width: 280px;
					}
					
					.boq-fullscreen-modal .col-num {
						width: 85px;
						min-width: 75px;
					}
				}
				
				/* Fix modal z-index issues in full-screen */
				.boq-fullscreen-modal .modal {
					z-index: 10002 !important;
				}
				
				.boq-fullscreen-modal .modal-backdrop {
					z-index: 10001 !important;
				}
				
				/* Ensure dialogs appear above full-screen modal */
				.frappe-dialog {
					z-index: 10002 !important;
				}
				
				.frappe-dialog .modal-dialog {
					z-index: 10002 !important;
				}
				
				/* Fix date picker z-index in full-screen modals */
				.boq-fullscreen-modal .flatpickr-calendar {
					z-index: 10003 !important;
				}
				
				.boq-fullscreen-modal .datepicker {
					z-index: 10003 !important;
				}
				
				/* Ensure proper scrolling in full-screen */
				.boq-fullscreen-modal .fullscreen-content {
					max-height: calc(100vh - 80px);
					overflow-y: auto;
					overflow-x: hidden;
				}
				
				.boq-fullscreen-modal .comprehensive-table-wrapper {
					max-width: 100%;
					overflow-x: auto;
				}
			</style>
		`);
	}
}

window.closeFullScreenBOQ = function () {
	// Exit browser full-screen if active
	if (document.fullscreenElement) {
		document.exitFullscreen();
	}

	// Remove modal
	const modal = $('#boq-fullscreen-modal');
	if (modal.length) {
		modal.fadeOut(300, function () {
			modal.remove();
		});
	}

	// Remove full-screen active class
	$('body').removeClass('boq-fullscreen-active');
	$('body').css('overflow', '');

	// Remove event listeners
	$(document).off('keydown.fullscreen');
	$(document).off('show.bs.modal');

	// Reset modal z-indexes
	$('.modal').css('z-index', '');
	$('.modal-backdrop').css('z-index', '');

	// Restore scroll position
	if (window._boq_fullscreen_state && window._boq_fullscreen_state.scrollPosition) {
		window.scrollTo(0, window._boq_fullscreen_state.scrollPosition);
	}

	// Clean up
	delete window._fullscreen_modal;
	delete window._boq_fullscreen_state;
};

window.refreshFullScreenBOQ = function (project) {
	if (!project && window._boq_fullscreen_state) {
		project = window._boq_fullscreen_state.project;
	}

	if (project) {
		// Show loading
		// Explicitly use the loading html
		$('#fullscreen-content-wrapper').html(`
			<div class="fullscreen-loading">
				<div class="loading-spinner"></div>
				<p>Refreshing BOQ data...</p>
			</div>
		`);

		// Fetch fresh data
		frappe.call({
			method: 'construction_management.api.boq_tree.get_boq_tree_data',
			args: { project: project },
			callback: function (r) {
				if (r.message && r.message.has_boq) {
					updateFullScreenBOQContent(project, r.message);
				}
			}
		});
	}
};
