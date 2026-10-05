---
name: OnyxMX-LogisticsManagement
description: "Hard Onyx.mx logistics rules: truck weight limit, crate-vs-pallet cutoff, packing, manifests. Use when changing packing, shipping or trucking logic."
---

# OnyxMX Logistics Management

This skill provides the architectural guidelines, state definitions, and business logic requirements for the logistics engine of Onyx.mx.

## 1. Core Domains

The logistics module is divided into three primary functional zones:
- **Packing (`packing`):** Groups individual `InventoryItem` records into physical `Crate` objects.
- **Shipping / Warehouse (`warehouse`):** Manages the staging and geometric stacking of Crates on a virtual 3D floor plan (using Three.js/R3F).
- **Trucking (`trucking`):** Simulates placing crates into a 53-foot trailer, monitoring weight distribution and total volume (Floor %).

## 2. State & Atoms (`src/lib/atoms.tsx`)

When developing logistics features, always utilize the established Jotai atoms:
- `shippingCratesAtom`: Live array of `Crate` objects in memory.
- `truckingPositionsAtom`: Stores 3D coordinate placements (`x, y, z, rotation, isFlipped`) of crates inside the truck.
- `truckingReadyFieldsAtom`: Stores manifest data (Tractor, Trailer, Driver, Seals, Destination).
- `logisticsDataAtom`: Source of truth synced from Supabase `logistics_826` collection.

## 3. The `Crate` Entity

Crates (or Pallets) are the foundational unit of logistics. 
- **Dimensions:** Must strictly enforce height (`h`), width (`w`), and length (`l`) in centimeters. If `h > 40`, it is visually and logically considered a "Crate"; otherwise, it is a "Pallet".
- **Weight Tracking:** Every crate computes its gross weight (`weight_kg`) dynamically by summing the `weightKg` of contained inventory items. The system must enforce a 24,000 kg hard limit per truck.

## 4. Export & Artifacts

- **Logistics Labels:** Packing labels are generated as PDFs (`jsPDF`) in standard sizes (e.g., 50x30mm, 100x100mm). Always ensure QR codes (linking to `?tagid=...`) are embedded.
- **Truck Manifests:** When a truck is marked "Ready" (`truckReadyTriggerAtom`), the system must export a comprehensive Bill of Lading (BoL) and dispatch an alert.

## 5. Subagent Instructions

When delegating tasks to subagents regarding Logistics:
1. "Ensure 3D geometry respects the `TRUCK_L_CM` (1615) and `TRUCK_W_CM` (244) constants."
2. "Always validate inventory statuses before packing (only `Available` or `Paid` items can be packed)."
3. "Do not directly mutate `logisticsDataAtom`; dispatch updates through the `useSyncEngine()` to ensure Supabase propagation."
