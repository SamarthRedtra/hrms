import frappe
from frappe.desk.doctype.desktop_icon.desktop_icon import sync_desktop_icons, clear_desktop_icons_cache


def execute():
	"""
	Restore all desktop icons from installed apps.
	This patch syncs desktop icons from all apps' desktop_icon directories
	into the database, restoring icons that may have been deleted.
	"""
	try:
		frappe.logger().info("Starting desktop icons restoration...")
		
		# Sync desktop icons from all installed apps
		sync_desktop_icons()
		
		# Clear desktop icons cache for all users
		clear_desktop_icons_cache()
		
		# Clear general cache to ensure icons are refreshed
		frappe.clear_cache()
		
		frappe.db.commit()
		
		frappe.logger().info("Desktop icons restoration completed successfully")
		
	except Exception as e:
		frappe.logger().error(f"Error restoring desktop icons: {str(e)}")
		frappe.db.rollback()
		raise

