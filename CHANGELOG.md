# Changelog

## v1.10.67
- **Top Bar Refactor:** Removed Onyx logo, version count, inventory title, toggle financial, and toggle display buttons from the header for a cleaner layout
- **Search Bar:** Enhanced to full-width liquid glass style with responsive animations
- **Sidebar:** Relocated Onyx logo and version tag to the bottom of the sidebar (expanded + compact modes)
- **Dashboard:** Added "Lock Financial Info" toggle button to Admin Dashboard header
- **Inventory Filters:** Made filter panel collapsible with animated expand/collapse; added "Types" and "Count" tags above the inventory list; moved grid/list toggle into the inventory area
- **Payments Overview:** Separated payment summary from action buttons; removed "General Overview" and "Details" titles; added vendor color-coded bubbles with progress rings in minimal view
- **Payments Full View:** Removed Pending totals; MXN and USD values displayed side-by-side at equal size; "Add Payment" button moved inline with vendor request cards; removed "Add Expense" button
- **Payments Top Bar:** Shows compact summary stats and a "Show Overview" button when overview is collapsed
- **Destination Cards:** Replaced flat icon row with stacked card deck animation with spring physics on select/deselect
- **Security:** Removed leaked API key from .env.example

## v1.10.66
- Implemented automatic language selection at login: Spanish for Vendors, English for Admins, Clients, and Developers.
- Integrated AI-powered auto-translation (to English) and spelling autocorrection for Vendor product submissions in FastEntryForm and UploadEntryForm.

## v1.10.65
- Added new General Overview panel directly into TrackingPaymentsView for easier total viewing
- Fetched real-time Exchange Rate (USD-MXN) to display within the general payments overview
- Re-designed the details tab to properly include data-dense table and removed filter bar bloat
- Dashboard adjusted to a four column responsive grid, removed the land and retail totals
- Fixed placeholder image overlay bugs across inventory layouts

