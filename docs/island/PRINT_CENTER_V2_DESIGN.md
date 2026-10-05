# Print Center V2 Redesign Strategy
*(Guided by the Apple Design Skill)*

## 1. Goal
Absorb the standalone, modal-based LabelWizard and NFCWizard into the native tabbed surfaces of the PrintCenter. Instead of popping up modals, the workflows must feel native to the Print Center's layout, respecting the principles of familiarity and progressive disclosure.

## 2. Structural Redesign (Lens: Layout & Interaction)
- **Eliminate Modals**: The LabelWizard and NFCWizard are currently monolithic modals. They will be deconstructed. Their main configuration panels will become the permanent sidebars or top-level forms of the PrintCenter's 'Templates' and 'NFC' tabs.
- **Master-Detail Layout**: Following macOS/iPadOS Split View patterns, the left column will host the configuration (Printer selection, Label Data, NFC writing options), and the main right column will host the Live Preview (the actual label preview or NFC status animation).
- **Progressive Disclosure**: Advanced packing settings (Manifestos, Crates) will be hidden behind "Advanced Options" toggles rather than overwhelming the default view.

## 3. Visual Craft (Lens: Liquid Glass & Craft)
- The Print Center will adopt the Liquid Glass V3 styling for its action buttons (Print, Write to Tag).
- We will replace the standard boring tables with high-fidelity ItemRow components for the batch processing list.
- A signature element: An animated "Print Queue" status ring or NFC write-pulse that clearly communicates the system state, delighting the user when a print job fires successfully.

## 4. Execution Plan (Phase 7B & 7C)
Because LabelWizard.tsx is an 1800-line monolith, we cannot rip it apart in a single pass. We must migrate it section by section:
- **Task 7B.1**: Build PrintCenterNfcTab.tsx by extracting the NFC hook logic and the radar animation from the old wizard.
- **Task 7B.2**: Build PrintCenterTemplatesTab.tsx by extracting the useLabelGenerator logic, the Data Matrix rendering, and the Template selector.
- **Task 7B.3**: Route the Print Action buttons from the universal Inventory/Logistics views directly into the Print Center's pre-filled state, effectively retiring LabelWizard.tsx permanently.
