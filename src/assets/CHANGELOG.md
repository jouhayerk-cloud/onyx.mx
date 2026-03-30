# Changelog

## v1.57.1 (2026-03-30)
- **Tagging Precision [Engine]**: Enhanced `getStatusClass` logic to check both `pay_req` and `status` columns.
- **Requested Status Fix**: Resolved regression where items were mislabeled as "New" after edits.
- **Production Tagging**: Introduced dedicated Blue `Production` tag for items in progress.
- **Workflow Sorting**: Updated "Status" sort sequence to prioritize financial urgency.

## v1.57.0 (2026-03-30)
- **Inventory Edit Redesign [Studio]**: Completely overhauled the Edit Panel to match the "Manual Entry Form" aesthetic.
- **Visual Identity**: Integrated vendor selection bubbles and status tabs (Available, Production, Acquisition) for a more intuitive experience.
- **Logistics & Financials**: Added dedicated sections for physical dimensions (W/H/D), weight (KG), and acquisition price (MXN).
- **Core Restoration**: Reintroduced missing financial metrics (`LD Code`, `Landed USD`, `Retail USD`) and physical metrics (`Weight`) to list/grid views.
- **Administrative Tools**: Implemented the "Hide Artifact" (Delete) button for authorized roles to manage inventory visibility without data loss.

## v1.56.0 (2026-03-30)
- **Dashboard Panel Optimization [Layout]**: Implemented responsive panel behaviors based on screen size on load.
- **Large Screen Maximization**: All modules (Logistics, Financials, Queue, Payments, Analysis) now load maximized on large screens (>1024px).
- **Small Screen Minification**: "Expenses & Financials", "Storage & Logistics", and "Upcoming Payments" now auto-minimize on mobile and tablet views to improve usability.

## v1.55.1 (2026-03-30)
- **Filter Bar Stabilization [Bug Fix]**: Resolved a critical issue where Category and Material discovery bars were failing to deploy.
- **Toggle Logic Calibration**: Fixed boolean toggle errors in the `onClick` handlers for filter icons.
- **UI Restoration**: Fully restored missing JSX components for multi-layered filter bars in the Inventory module.

## v1.55.0 (2026-03-30)
- **Inventory UI Redesign [Layout]**: Replaced vertical absolute-positioned Sort and Filter menus with a consolidated horizontal button group in the top panel.
- **Icon-Only Discovery**: Implemented visual-only triggers (Tag, Layers, Box) for Vendor, Category, and Material discovery panels to maximize screen space.
- **Horizontal Sort Control**: Integrated Date, Status, Vendor, Category, and Material sorting into a single row, appearing conditionally on `isSortMenuOpen`.
- **System Restoration**: Successfully recovered and stabilized the `UnifiedInventoryView.tsx` component logic after a structural regression.
- **Global Deployment**: Published the v1.55.0 update to production.

## v1.50.0 (2026-03-30)
- **Compact Financials Dashboard [major]**:
    - **Multi-Segment Bar Graph**: Engineered a custom visualization for Mexico Total, Expenses, Acquisitions, and Unpaid amounts in a single compact bar.
    - **Default Entry State**: Updated the Overview module to load in "Compact Mode" by default for faster auditing.
    - **Interaction Design**: Integrated seamless click-to-expand transitions between compact and granular financial views.

---
