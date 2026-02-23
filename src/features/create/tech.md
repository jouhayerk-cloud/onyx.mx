# Technical Overview & Debugging Guide

## 1. AI Prompting Strategy

This application leverages the Google Gemini API, specifically the `gemini-2.5-flash` model for its speed and multimodal capabilities, and `gemini-2.5-flash-image` for advanced image editing tasks.

**Core Techniques:**

1.  **Multimodal Input**: Most AI interactions involve sending both an image and a text prompt. The image is resized client-side for efficiency and sent as a base64-encoded string.

2.  **Structured Output (JSON with Schema)**: A crucial technique is instructing the model to return its findings in a specific JSON format by providing a `responseSchema`. This makes the response predictable and easy to parse.
    *Example Prompt Fragment:* `"...Output a json list where each entry contains the 2D bounding box in "box_2d" and a text label in "label"."`

3.  **Task-Specific Prompts & Workflows**: The application uses different, carefully crafted prompts for each AI task:
    -   **"Fast Entry" & "Voice" Autofill (`FastEntryForm.tsx`)**: A chain of AI calls is triggered after an image is uploaded and the shape/material are provided. This includes prompts for object detection, segmentation, and detailed data extraction (dimensions, weight, descriptions).
    -   **Visual Analysis (`ActionPanel.tsx`)**: This is the classic multi-step workflow for new items, involving separate, focused prompts for detecting boxes/points and then generating segmentation masks. The mask prompt is highly specific, demanding a white-on-black base64 image to ensure reliable client-side processing.
    -   **Text Generation (`DetailsPanel.tsx`)**: Prompts are tailored for different tones (Short, Bullet Points, Detailed). The "Detailed" prompt specifically asks for simple HTML (`<p>`, `<strong>`, etc.) for rich text rendering.
    -   **Image Editing (`DetailsPanel.tsx` - Images Tab)**: This uses a multi-part prompt for the `gemini-2.5-flash-image` model, providing a scene image, a transparent product image, and text instructions to combine them.

## 2. Application Architecture

-   **Frontend**: A single-page application built with **React** and **TypeScript**.
    -   **State Management**: **Jotai** is used for global state management. Its atomic model allows components to subscribe to only the specific pieces of state they need, preventing unnecessary re-renders. Key atoms include `SelectedItemDataAtom`, `workflowStepAtom`, and atoms for storing AI results.
    -   **Styling**: **TailwindCSS** is used for rapid, utility-first styling. The application features a custom "liquid glass" theme that relies on CSS `backdrop-filter` and an SVG `feDisplacementMap` filter (`#liquid-glass`) applied via a `::before` pseudo-element to create a distorted glass effect without blurring the UI content itself.

-   **Backend**: **Google Apps Script** serves as a lightweight, serverless backend.
    -   **Role**: It acts as a secure API gateway between the React frontend and Google Workspace services.
    -   **Functionality**: It exposes a single `doPost` endpoint that routes requests based on an `action` parameter. It handles all database operations for two separate Google Sheets (`Inventory` and `ID` for acquisitions), manages file uploads to Google Drive, and retrieves image data from Drive.

## 3. Key Components & Features

-   **`FastEntryForm.tsx` & `VoiceEntryForm.tsx`**: These components provide a full-screen, immersive experience for creating new items. They manage a sequence of UI states, handle voice input, trigger the chain of AI analysis tasks, and display real-time status updates.
-   **`ActionPanel.tsx`**: This component houses the UI for the manual, step-by-step AI visual analysis workflow (Detect/Tag, Generate Masks).
-   **`Dashboard.tsx`**: A new, major component that provides a data-grid view for managing item acquisitions. It performs its own data fetching, calculations, and updates independent of the main inventory view.
-   **Mask-to-Vector Conversion (`utils.tsx`)**: A standout feature. When a segmentation mask is received (as a raster image), the application:
    1.  Draws the mask onto a temporary canvas.
    2.  Uses `findContour()` to trace the outline of the pixels, generating a series of points.
    3.  Uses `simplifyContour()` (Ramer-Douglas-Peucker algorithm) to reduce the number of points while preserving the shape.
    4.  Uses `createCurvePath()` to convert the simplified points into a smooth SVG path string. This vector path is what enables the powerful mask editor.

-   **`Content.tsx` & `ExtraModeControls.tsx`**: These components form the annotation and editing UI.
    -   **`MaskEditor`**: The full-screen SVG environment for editing vector masks. It uses Jotai atoms for pan and zoom state and handles pointer events to allow direct manipulation of path nodes.
    -   **Client-Side Exports**: The "Export PNG" and "Export SVG" features are implemented on the client. The PNG export uses the `<canvas>` API's `clip()` method with a `Path2D` object to crop the original image to the mask's shape.

## 4. Debugging Guide

**Problem: AI results are not appearing, or an AI task fails.**
1.  **Check Console for API Errors**: Open your browser's developer tools (F12) and look at the Console tab. Errors from the Gemini API will often appear here (e.g., `400 Bad Request`, `429 Quota Exceeded`, `500 Server Error`).
2.  **Verify API Key**: Ensure the `process.env.API_KEY` is correctly configured in your deployment environment.
3.  **Inspect Raw Response**: In the component making the call (e.g., `FastEntryForm.tsx`), find the `ai.models.generateContent(...)` call. Add `console.log(result)` right after it. This will show you the exact response from the model before the app tries to parse it, which can reveal if the model failed to return valid JSON.

**Problem: Data is not saving to or loading from Google Sheets.**
1.  **Check Apps Script Executions**: Open the Google Apps Script project associated with your `SCRIPT_URL`. In the left sidebar, click on "Executions". This will show a log of all recent requests from your app. Click on a failed execution (marked in red) to see the server-side error logs. This is the most effective way to debug backend issues.
2.  **Log the Frontend Payload**: In the function making the call (e.g., `handleSubmit` in `FastEntryForm.tsx` or `handleSave` in `Dashboard.tsx`), add `console.log('Payload:', JSON.stringify(payload))` before the `fetch` call to see exactly what data is being sent to the backend.

**Problem: The Mask Editor is behaving incorrectly.**
1.  **Check Transformations**: The math for converting points between coordinate systems is complex. In `ExtraModeControls.tsx`, inside `handleSaveChanges`, log the `editedMaskPoints` (in pixel coordinates) and the `reverseTransformedPoints` (in normalized 0-1 coordinates) to ensure the conversion is happening as expected.
2.  **Inspect State with React DevTools**: Use the React DevTools browser extension to inspect the values of `editorZoomAtom`, `editorPanOffsetAtom`, and `editedMaskPointsAtom` in real-time to see if they are updating correctly during pan/zoom/drag operations.

**Problem: Images from the Inventory or Dashboard are not loading.**
1.  **Check Network Tab**: Open the developer tools and go to the Network tab. Look for the `fetch` request to your `SCRIPT_URL` with the action `getImageBase64FromDriveId` or `getInventory`/`getAcquisitions`. Check its status and the response payload.
2.  **Test Apps Script Directly**: In the Apps Script logs, find the relevant execution and check for errors related to file permissions or invalid IDs in Google Drive.