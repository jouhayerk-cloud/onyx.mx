# Redesign `Create` Menu to `Upload` Workflow

## Goal Description
Redesign the "Create" menu into a single, unified, dynamic, and responsive workflow called "Upload". This workflow will serve both users and admins to upload new inventory items to the Supabase database. The workflow will optionally handle images (including integrations with Google Drive via Apps Script) and allow users to select from various media types (sample image, lot image, video, single item image, or no media) before proceeding to item data entry and database submission. The sidebar will be reorganized to exactly: **Upload, Inventory, Logistics, Finances**.

## Proposed Changes

### 1. `c:\Jouhayerk\git\app\src\features\core\MainAppView.tsx`
- #### [MODIFY] [MainAppView.tsx](file:///c:/Jouhayerk/git/app/src/features/core/MainAppView.tsx)
  - Change the `Create` sidebar menu to `Upload`.
  - Remove existing `createSubItems` (New, Batch, Video). The `Upload` menu will just be a top-level menu item or default to the first step of the unified flow.
  - Re-order the sidebar loop/items to match: **Upload, Inventory, Logistics, Finances**.
  - Route the UI to show `<UploadView />` when `activeView === 'upload'`.

### 2. `c:\Jouhayerk\git\app\src\lib\atoms.tsx`
- #### [MODIFY] [atoms.tsx](file:///c:/Jouhayerk/git/app/src/lib/atoms.tsx)
  - Change `activeViewAtom` type to include `'upload'`.
  - Create atoms to track the state of the unified upload workflow (e.g. `uploadCurrentStepAtom`, `uploadSelectedMediaTypeAtom`).

### 3. `c:\Jouhayerk\git\app\src\features\upload\` (New Module)
- #### [NEW] [UploadView.tsx](file:///c:/Jouhayerk/git/app/src/features/upload/UploadView.tsx)
  - The main container for the step-by-step unified workflow UI. It manages stepping through media selection, AI processing (for videos/images), item details form, and final submission.
- #### [NEW] [UploadMediaStep.tsx](file:///c:/Jouhayerk/git/app/src/features/upload/UploadMediaStep.tsx)
  - UI for the user to select media upload type: "Sample Image", "Lot Image", "Video", "Single Item Image", or "No Image".
- #### [NEW] [UploadDetailsStep.tsx](file:///c:/Jouhayerk/git/app/src/features/upload/UploadDetailsStep.tsx)
  - The form where the user inputs item metadata. Inherits/migrates functionality from the existing `FastEntryForm.tsx`.
- #### [NEW] [UploadReviewStep.tsx](file:///c:/Jouhayerk/git/app/src/features/upload/UploadReviewStep.tsx)
  - A summary step showing the selected media, AI-generated insights, and text fields before finalizing the upload via `db.inventory.upsert`.

### 4. `c:\Jouhayerk\git\app\src\features\create\`
- Code from this directory (like AI functions in `FastEntryForm`, logic in `BatchImportModule`, and `VideoAnalysisView`) will be functionally migrated/integrated into the new `UploadView` subcomponents.
- We will leave the original directory intact during development to draw logic/styles from, but no longer reference it in `MainAppView.tsx`.

## Verification Plan

### Automated Tests
- Run TypeScript compiler `npx tsc --noEmit` to ensure no typing errors.

### Manual Verification
1. Run `npm run dev` and navigate to `http://localhost:3000`.
2. Observe the sidebar shows exactly: **Upload, Inventory, Logistics, Finances**.
3. Click on the **Upload** menu item. Verify that it opens the new unified workflow instead of the old submenu.
4. **Test "No Image" Flow:** Select the "No Image" option, fill out the item detail form, submit, and verify the item is added to the Supabase database (check the Inventory tab).
5. **Test "Single Item Image" Flow:** Upload an image, verify the Gemini AI automatically processes it (extracting details), verify the details step is pre-filled, submit, and verify the item is correctly added to the database with the associated image links.
6. Verify the UI is fully responsive (desktop and mobile) and matches the app's dark/glassmorphic aesthetic.
