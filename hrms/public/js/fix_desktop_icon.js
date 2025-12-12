// Copyright (c) 2024, HRMS App
// Fix for TypeError: Cannot read properties of undefined (reading 'includes')
// in frappe.utils.get_desktop_icon method
// Also fixes icon display issues by adding fallback logic for variants

frappe.provide("frappe.utils");

// Override get_desktop_icon method to fix undefined variant error and add fallback
frappe.utils.get_desktop_icon = function(icon_name, variant) {
	let exists = false;
	let icon_data = this.get_desktop_icon_by_label(icon_name);
	variant = variant.toLowerCase();
	
	if (!icon_data?.app) return exists;
	
	let app_name = icon_data.app;
	let icon_url = `assets/${app_name}/icons/desktop_icons/${variant}/${frappe.scrub(
		icon_name
	)}.svg`;

	// Check if boot data exists
	if (!frappe.boot?.desktop_icon_urls || !frappe.boot.desktop_icon_urls[app_name]) {
		return exists;
	}

	let app_icons = frappe.boot.desktop_icon_urls[app_name];
	let variant_list = app_icons[variant];

	// Check if requested variant exists and has the icon
	if (variant_list && Array.isArray(variant_list) && variant_list.includes(icon_url)) {
		return `/${icon_url}`;
	}

	// Fallback: try the other variant if requested one doesn't exist or doesn't have the icon
	let fallback_variant = variant === "subtle" ? "solid" : "subtle";
	let fallback_list = app_icons[fallback_variant];
	let fallback_url = `assets/${app_name}/icons/desktop_icons/${fallback_variant}/${frappe.scrub(
		icon_name
	)}.svg`;

	if (fallback_list && Array.isArray(fallback_list) && fallback_list.includes(fallback_url)) {
		return `/${fallback_url}`;
	}

	return exists;
};

// Also fix desktop_icon_exists method to prevent similar errors
if (frappe.utils.desktop_icon_exists) {
	frappe.utils.desktop_icon_exists = function(app_name, url) {
		let exists = false;
		
		if (
			!frappe.boot?.desktop_icon_urls ||
			!frappe.boot.desktop_icon_urls[app_name]
		) {
			return exists;
		}

		let app_icons = frappe.boot.desktop_icon_urls[app_name];
		
		// Check both variants
		for (let variant of ["subtle", "solid"]) {
			let variant_list = app_icons[variant];
			if (variant_list && Array.isArray(variant_list) && variant_list.includes(url)) {
				exists = true;
				break;
			}
		}
		
		return exists;
	};
}

