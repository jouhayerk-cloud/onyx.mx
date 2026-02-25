# Onyx.mx Application: Version Log

This document tracks major changes and milestones as we progress towards the next release.

---

## **v2.5.5 - Unified Navigation: Dashboard + Workbook Merge**

### **Date:** 2026-02-24

- **NAVIGATION OVERHAUL**: Removed separate Dashboard and Workbook sections from the sidebar. All functionality now lives under 4 unified sections: **Create**, **Inventory**, **Logistics**, **Finance**.
- **INVENTORY SECTION**: Consolidated Catalog (CatalogMarketView), Production orders, Acquisitions (from Dashboard), and Archive into a single section with top sub-tab navigation.
- **LOGISTICS SECTION**: Unified Packing (warehouse crate management), Trucking (3D truck loading view from Dashboard ShippingView), and Shipping (full shipment tracking table with Warehouse → In Transit → Delivered status workflow).
- **FINANCE SECTION**: Merged Dashboard Payments (PaymentsView), Finance Tracking (subcategory-filtered expense table with add/edit), and Monthly Expenses (recurring expense cards) into one section.
- **SUB-TAB UI**: Each section now features a premium top-bar with colored pill buttons, live summary metrics, and inline status controls.
- **STATE ARCHITECTURE**: Replaced `activeViewAtom` (5 views) with 4 unified sections + 3 sub-tab atoms (`inventorySubTabAtom`, `logisticsSubTabAtom`, `financeSubTabAtom`).
- **FILES**: Created `InventoryView.tsx`, `LogisticsView.tsx`, `FinanceView.tsx` as unified section containers.

---

### **Date:** 2026-02-24

- **FINANCE PANEL**: New Supabase-backed financial management panel in Workbook. Supports subcategory filtering (Acquisition, Monthly Expense, Supplies, Labor, Crate/Pallet, Operating), add-expense modal with vendor/amount/description fields, and inline Requested ↔ Paid status toggle.
- **LOGISTICS PANEL**: New Supabase-backed logistics panel replacing the old Crates tab. Card-based grid layout with Warehouse → In Transit → Delivered status workflow, vendor color-coding, tracking numbers, origin/destination routing, customs status, and freight cost display.
- **SCHEMA v4**: Extended Supabase `finance` table with 13 new columns (subcategory, payment_method, bank_account, exchange_rate, reference, approved_by, related_inventory_ids, recurring, recurring_day, etc.). Extended `logistics` table with 8 new columns (origin, destination_address, contents_summary, insurance_value, customs_status, pallet_count, crate_count, freight_cost).
- **RxDB v6/v3**: Bumped finance schema to v6 and logistics schema to v3 with migration strategies for seamless local data transition.
- **TAB CONSOLIDATION**: Unified Workbook tabs from scattered Excel-dependent views to 6 clean Supabase-backed tabs: Inventory, Archive, Finance, Production, Logistics, Database.
- **TYPES**: Added `FinanceRecord`, `LogisticsRecord` TypeScript interfaces and `FinanceSubcategory` union type for type-safe data handling.

---

## **v2.1.0 - Power Workbook Redesign & Stability Improvements**

### **Date:** 2026-02-24

- **WORKBOOK REDESIGN**: Transformed the Workbook into a high-density "Power Tracker" with a unified HUD, adaptive layouts (Table, Gallery, Kanban), and an integrated Quick-Edit side panel.
- **DATABASE STABILITY**: Standardized the RxDB schema and decoupled synchronization from initialization to prevent UI hangs on empty or slow databases.
- **VERSION TRACKING**: Implemented visible version numbering in the main application header.
- **UI POLISH**: Optimized loading states across the dashboard and workbook modules.

---

## **v2.0.0 - Unified Supabase Architecture & Workflow Re-alignment**

### **Date:** 2026-02-24

- **MAJOR UPDATE**: Complete migration from Google Sheets to **Supabase** (v4 Schema). This marks the transition to a high-performance, real-time relational backend.
- **WORKFLOW REDESIGN**: Re-organized the application UI around the core product lifecycle: **Create -> Catalog -> Workbook -> Dashboard**.
- **ACQUISITION TRACKING**: Implemented advanced "Mark as Acquired" logic for Admins and Clients, capturing the acquisition metadata (who and when) directly in the inventory records.
- **FINANCIAL DISPERSAL**: Introduced a 3-step financial workflow: **Requested -> Sent -> Dispersed**, with support for multiple bank accounts (Ramses BBVA, Martha BBVA, BOA).
- **EXPENSE MANAGEMENT**: Integrated tracking for additional operational costs: Monthly expenses, Supplies, Crates, and Laborers.
- **RBAC v2**: Refined Role-Based Access Control enforcing strict workflow boundaries for Developers, Admins, Clients, and Vendors.

---

### **v1.0.0 - Public Beta 1 Launch & Role-Based Permissions**

**Date:** 2024-08-06

- **MILESTONE**: Official **Public Beta 1** release of **Onyx.mx**. A special welcome to our administrators, Ramses and Martha, and our dedicated team of vendors. Your collaboration has been instrumental in reaching this Public Beta. Let's make it a great one!
- **SECURITY & UX**: Implemented critical role-based access control (RBAC) to provide a secure and tailored experience for different user types.
- **ADMIN-ONLY DASHBOARD**: The entire "Dashboard" section (Acquisitions, Payments, Shipping) is now exclusively visible and accessible to users with the 'Admin' role.
- **VENDOR DATA ISOLATION**: The backend now automatically filters data based on user role. Vendors can only view and interact with inventory items and financial records that are directly associated with their vendor ID. This creates a secure, focused workspace for each partner.

### **v0.9.12 - Final Private Beta & Renaming**

**Date:** 2024-08-05

- **MILESTONE**: Official final private beta release candidate. The application is now feature-complete for the public beta launch.
- **BRANDING**: The application has been officially renamed to **Jouhayerk/ Onyx OS**. All relevant documentation and branding will be updated to reflect this change.
- **TESTING**: This version will be distributed for local Node.js installation and testing across various user environments to ensure stability and compatibility for the upcoming public release.
- **PUBLIC BETA**: This release marks the final sign-off before the first public beta launch.

### **v0.9.11 - Payments UI Robustness & SVG Centralization**

**Date:** 2024-08-04

- **BUG FIX**: Resolved a critical asset loading issue in the `PaymentsView` where SVG icons for payment destinations were failing to load.
- **REFACTOR**: Centralized SVG icon management. Instead of being embedded directly in `PaymentsView.tsx`, icons are now imported from a dedicated `paymentsIcons.svg.tsx` module. This improves maintainability and follows best practices for separation of concerns.
- **UI/UX**: This change ensures payment destination icons are now reliably displayed, improving the visual clarity and user experience of the financial timeline.
- **DOCUMENTATION**: Updated `safetodelete.md` to reflect that `paymentsIcons.svg.tsx` is a required module.

### **v0.9.10 - Acquisitions Dashboard Overhaul & SKU Generation**

**Date:** 2024-08-03

- **FEATURE**: Restored and enhanced the SKU code generation and price calculation logic in the Acquisitions Dashboard.
- **AUTOMATION**: Code and price calculations now run automatically on-the-fly for all items, decoupling them from the "Commit" action.
- **LOGIC**: Implemented custom business logic for generating codes with the `**********` cypher and for calculating landed/retail prices based on user-configurable parameters.
- **UI/UX**: Completely redesigned the Acquisitions item list for a more data-rich and spatially balanced layout, featuring item thumbnails, a condensed dimensions panel, and a prominent barcode display.
- **WORKFLOW**: Simplified the "Commit" button's function to solely advance an item's status, making the logistics pipeline more intuitive.

### **v0.9.9 - Final Integration & Style Completion**

**Date:** 2024-08-02

- **MILESTONE**: The full application integration is complete. All legacy modules have been successfully migrated into the new native React architecture.
- **FEATURE**: Restored the `FastEntryForm` for AI-powered item creation, seamlessly integrating its full-screen, timeline-driven UI into the main application.
- **UI/UX**: The "liquid glass" style update is now finalized and applied consistently across all views, including the restored `FastEntryForm` and `ShippingView`, providing a cohesive and modern user experience.
- **STABILITY**: Resolved multiple React rendering errors (`#137`) and TypeScript typing issues across components to ensure application stability.

### **v0.9.8 - Critical Regression Fix & Feature Restoration**

**Date:** 2024-08-01

- **BUG FIX**: Addressed a critical style regression that broke container layouts and component styling across the application.
- **BUG FIX**: Restored the animated gradient background and theme-switching functionality which were disabled by the regression.
- **FEATURE RESTORE**: Re-implemented the unified, timeline-based `PaymentsView`, replacing a temporary placeholder and restoring the intended single-scrollable-list UX.
- **FEATURE RESTORE**: Re-implemented the native React `ShippingView`, replacing a regressed `iframe` version and restoring the modern, integrated 3D shipping planner.
- **STABILITY**: Corrected multiple minor bugs in component state and hooks that were introduced during the failed compilation fix.

---

### **v0.9.7 - Payments Module Redesign**

**Date:** 2024-07-31

- **UI/UX**: Overhauled the `PaymentsView` from a tabbed interface to a unified, single-scrollable timeline. This provides a clearer, at-a-glance overview of all financial activities (inventory, expenses, withdrawals, recurring, invoices).
- **REFACTOR**: Simplified the UI by using modals for all create/edit actions, launched from a single "+ Add New" button.
- **FEATURE**: Updated the top summary cards to reflect the unified data model, showing "Total Due," "Total Paid (This Month)," and "Upcoming."

---

### **v0.9.6 - Advanced Financial Features Restored**

**Date:** 2024-07-30

- **FEATURE**: Re-integrated the "Recurring" payments module to manage schedulable expenses like rent and services.
- **FEATURE**: Restored the "Invoicing" module for tracking B2B client payments and balances.
- **FEATURE**: Enhanced the "Withdrawals" tracker to include a "Fast Cash" option that automatically calculates a 10% commission.
- **BACKEND**: Added new functions and dedicated sheets (`Recurring`, `Invoices`) to the Apps Script backend to support these features.
- **UI/UX**: All new financial modules are now accessible via a comprehensive tabbed interface in the `PaymentsView`.

---

### **v0.9.5 - Withdrawal Tracking Restored**

**Date:** 2024-07-29

- **FEATURE**: Restored legacy financial management functionality by adding a "Withdrawals" tracker to the `PaymentsView`.
- **FEATURE**: The new module allows for full CRUD management of cash withdrawals, including tracking amounts (MXN/USD), commissions, and destinations.
- **BACKEND**: Updated the Apps Script backend to handle a new `Withdrawals` sheet in the Google Spreadsheet database.
- **UI/UX**: The new feature is integrated as a third tab in the `PaymentsView`, complete with a dashboard summary of total withdrawn amounts.

---

### **v0.9.4 - General Expense Tracking Added**

**Date:** 2024-07-28

- **FEATURE**: Implemented a "General Expenses" tracker within the `PaymentsView` for non-inventory related costs.
- **UI/UX**: The `PaymentsView` now uses a tabbed interface to separate "Inventory Payments" from the new "General Expenses" module.
- **FEATURE**: The new module supports full CRUD (Create, Read, Update, Delete) operations for expenses.
- **BACKEND**: Updated the Apps Script backend to manage a new, separate `Payments` sheet in the Google Spreadsheet for expense data.

---

### **v0.9.3 - Full Logistics Workflow Implemented**

**Date:** 2024-07-27

- **FEATURE**: Implemented the full logistics workflow: **Acquisitions -> Payments -> Shipping**.
- **UI/UX**: Replaced the header filter with a new multi-state "traffic light" system (Red, Yellow, Green) for filtering dashboard items by their logistics status.
- **FEATURE**: Overhauled the `PaymentsView` to automatically display acquired items pending payment. Users can now "Request Payment" (Red status) and "Mark as Paid" (Yellow status).
- **FEATURE**: Integrated the `ShippingView` with inventory. The "Manage Crate Contents" modal now shows all "Paid/Unshipped" (Yellow status) items, and shipping a crate updates all contained items to "Shipped" (Green status).

---

### **v0.9.2 - Project Roadmap Updated for RC1**

**Date:** 2024-07-26

- **DOCUMENTATION**: Updated `beta.md` to include a new major goal for the RC1 milestone: **"Full Logistics Workflow Integration"**.
- **PLANNING**: Detailed the plan to connect the Acquisitions, Payments, and Shipping modules and implement a new "traffic light" status filter in the header.

---

### **v0.9.1 - Beta Release & Version Logging**

**Date:** 2024-07-25

- **MILESTONE**: Marked the current application state as **Beta v0.9**.
- **DOCUMENTATION**: Created `beta.md`, a comprehensive document summarizing the user manual, AI strategy, technical overview, and development roadmap.
- **DOCUMENTATION**: Created this `versionLog.md` file to begin tracking development progress towards the next milestone: **Release Candidate 1 (RC1)**.
- **SUMMARY**: This version represents the culmination of a massive redesign effort, unifying the application's UI/UX with a glass theme, a hierarchical sidebar, global header controls, and the full integration of all core features into the new layout.
