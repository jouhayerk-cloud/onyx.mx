# Changelog

## [1.37.25] - 2026-03-28
### Changed
- **Dashboard Layout**: Reordered the primary dashboard panels. **Expenses & Financials** is now positioned on the left side (wider span), and **Storage & Logistics** is positioned on the right side.

## [1.37.24] - 2026-03-28
### Fixed
- **Distribution Analysis Data**: Optimized the **Shape + Description** grouping logic by implementing a robust description fallback chain. The system now resolves data through `short_description`, `item_description`, and `generatedDescription` if the primary field is empty, significantly reducing the "No Description" count in the distribution graph.

## [1.37.23] - 2026-03-28
### Improved
- **Financials Compaction**: Reduced the vertical footprint of the **Expenses & Financials** panel by ~20%. Optimized padding, font sizes, and layout density for high-fidelity information display.
- **Tag ID Parity**: Synchronized the Tag ID calculation logic between the **Overview** (Active Request Queue) and the **Finance/Payments** module. Both modules now use the same on-the-fly calculation utility, ensuring 1:1 matching for tags like `EM3265E0X`.
