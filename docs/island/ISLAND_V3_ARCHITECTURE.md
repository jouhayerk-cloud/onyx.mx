# Onyx Island V3 Architecture

## 1. Dynamic States & Morphing
The Onyx Island will support multiple states driven by Framer Motion's layout animations:
- **Rest State (Pill)**: The Onyx Face centered, flanked tightly by quick-access icon launchers (left and right).
- **Expanded Tools State**: Morphs into a wider surface revealing full collections of tool icons (e.g., Add Entry, Export, Process).
- **Details State (Card)**: Expands vertically to host the Notification Center, Assistant Chat, or Inventory Details panel.

## 2. Omni-present Tool Access
- Tools must be universally accessible across all views (Desktop, Mobile) without relying strictly on the Sidebar.
- Tool sets will be grouped into "collections" that the Island can cycle through or expand to reveal.

## 3. Dynamic Face Scaling & Interaction
- **Adaptive Sizing**: The Onyx Face SVG scales dynamically based on the Island's current state (small in Rest, large in Assistant mode).
- **Gaze Tracking**: The face eyes will track the mouse pointer on desktop, and snap to look directly at the user (0,0) when clicked or tapped.

## 4. Mobile Ergonomics
- The Island is strictly docked to the **bottom** of the viewport on mobile devices.
- Bottom safe-area padding will be precisely calculated so it sits comfortably above the OS swipe-bar without wasted dead space.
- The top of the screen is reserved for the floating Onyx Sidebar Launcher.
