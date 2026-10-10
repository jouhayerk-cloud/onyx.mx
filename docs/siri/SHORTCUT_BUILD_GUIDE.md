# Siri Shortcuts Build Guide (iPhone Direct Setup)

**Document Version:** 1.0.0  
**Date:** 2026-10-10  
**Author / Target:** Ramses (Manual build on iPhone without Mac)  
**Endpoint Target:** `https://<project>.supabase.co/functions/v1/siri-inventory`  
**Review Status:** Pending Review by Ramses

---

## 1. What You Need

Before creating Shortcuts on your iPhone, verify you have the following prerequisites:

1. **iPhone Running iOS 16 or Later:** With the native **Shortcuts** app installed (pre-installed by Apple).
2. **Supabase Edge Function URL:**
   - Production URL placeholder: `https://<project>.supabase.co/functions/v1/siri-inventory`
   - Supabase project reference (`<project>`) and anon public key (`<anon-key>`) from your project settings.
3. **Active Onyx Account:**
   - Valid credentials (email & password) with an active row in `app_users`.
   - Initial access token (JWT) and refresh token issued by Supabase Auth (`https://<project>.supabase.co/auth/v1/token?grant_type=password` or copied from browser local storage session).
4. **Siri Voice Enabled:**
   - English (`en-US`) or Spanish (`es-MX`) language support enabled under **Settings > Siri & Search** (`VERIFY ON IPHONE`).
5. **Shortcuts iCloud Drive Permissions:**
   - Permission for Shortcuts to read and write small token cache files in the `Shortcuts` folder in iCloud Drive (`VERIFY ON IPHONE`).

---

## 2. Authentication Flow in Shortcuts

The `siri-inventory` Edge Function strictly validates a user access JWT in the HTTP `Authorization: Bearer <token>` header. Supabase access tokens expire after approximately 1 hour (3600 seconds).

To keep voice queries reliable without re-typing passwords, the Shortcut implements an automated token refresh cycle:

```
[Trigger Siri Shortcut]
       │
       ▼
[Check / Load Cached Refresh Token from iCloud Drive]
       │
       ├───> Found?
       │        ├── YES ──> [Call Supabase /auth/v1/token (grant_type=refresh_token)]
       │        │                 │
       │        │                 ├── 200 OK: Store new refresh_token in file, use new access_token
       │        │                 └── Failed / Expired: Prompt user for Password / Re-login
       │        │
       │        └── NO ───> [Prompt user for credentials or initial token paste]
       │
       ▼
[Execute siri-inventory POST request with Bearer <access_token>]
       │
       ▼
[Speak spoken_text via Siri]
```

### 2.1 Token Refresh Shortcut Action Steps

You can build this either as a standalone helper Shortcut named **"Onyx Auth Token"** (called via the **Run Shortcut** action) or embedded directly inside each Shortcut:

- [ ] **Step 1:** Add action **Get File** from `Shortcuts/onyx_refresh_token.txt` (`VERIFY ON IPHONE: Document Picker / Shortcuts subfolder path`). Toggle off **Show Document Picker** and toggle off **Error If Not Found**.
- [ ] **Step 2:** Add action **If** `[File]` has any value:
  - [ ] **Step 3:** Add action **Get Contents of URL** `https://<project>.supabase.co/auth/v1/token?grant_type=refresh_token`
    - **Method:** `POST`
    - **Headers:**
      - `apikey`: `<anon-key>`
      - `Content-Type`: `application/json`
    - **Request Body:** `JSON`
      - `refresh_token`: `[File]`
  - [ ] **Step 4:** Add action **Get Dictionary Value** for key `access_token` from `[Contents of URL]`.
  - [ ] **Step 5:** Add action **Get Dictionary Value** for key `refresh_token` from `[Contents of URL]`.
  - [ ] **Step 6:** Add action **Save File** with content `[Dictionary Value (refresh_token)]` to path `Shortcuts/onyx_refresh_token.txt`. Turn on **Overwrite If File Exists** (`VERIFY ON IPHONE`).
  - [ ] **Step 7:** Add action **Set Variable** `authToken` to `[Dictionary Value (access_token)]`.
- [ ] **Step 8:** Add action **Otherwise**:
  - [ ] **Step 9:** Add action **Ask for Input** with prompt *"Enter initial Supabase Refresh Token or Password:"* (`VERIFY ON IPHONE`).
  - [ ] **Step 10:** Add action **Save File** with content `[Provided Input]` to path `Shortcuts/onyx_refresh_token.txt`.
  - [ ] **Step 11:** Repeat initial token exchange and set variable `authToken`.
- [ ] **Step 12:** Add action **End If**.

### 2.2 Alternative: A Personal Siri Token

A dedicated revocable token table would be simpler for users and would avoid token expiration hurdles on mobile. Instead of rotating OAuth refresh tokens, the database would store long-lived, user-scoped API keys (e.g., in a new `siri_tokens` table) that can be instantly revoked from the Onyx admin screen. Introducing this design would need a database migration and is an architecture decision for Ramses.

---

## 3. Step-by-Step Build: 3 Voice Shortcuts

Below are the exact action-by-action steps to build each intent shortcut on an iPhone.

---

### Shortcut 1: Inventory Search (`intent: "search"`)

* **Siri Voice Phrases:**
  - English: *"Inventory search"* / *"Search Onyx"*
  - Spanish: *"Buscar inventario"* / *"Buscar en Onyx"*
* **Function Payload:** `{"intent": "search", "query": "<input>", "lang": "en" | "es"}`

#### Step-by-Step Actions:
- [ ] **1. Create New Shortcut:** Open the **Shortcuts** app, tap the **+** button in the top right.
- [ ] **2. Rename Shortcut:** Tap the title dropdown at the top, select **Rename**, and set name to `Inventory search` (or `Buscar inventario`) (`VERIFY ON IPHONE`).
- [ ] **3. Ask for Input:**
  - Action name: **Ask for Input**
  - Prompt: *"What item or stone do you want to search for?"* (or *"¿Qué artículo o material buscas?"*)
  - Input Type: `Text`
- [ ] **4. Set Variable:**
  - Action name: **Set Variable**
  - Variable Name: `SearchQuery`
  - Value: `[Provided Input]`
- [ ] **5. Run Authentication / Get Token:**
  - Action name: **Run Shortcut**
  - Shortcut: `Onyx Auth Token` (or embed the refresh logic from Section 2) (`VERIFY ON IPHONE`)
  - Output Variable: `authToken`
- [ ] **6. HTTP Request:**
  - Action name: **Get Contents of URL**
  - URL: `https://<project>.supabase.co/functions/v1/siri-inventory`
  - Method: `POST`
  - **Headers:**
    - `Authorization`: `Bearer [authToken]`
    - `Content-Type`: `application/json`
    - `apikey`: `<anon-key>`
  - **Request Body:** Select `JSON`
    - Key `intent` (Type: `Text`): `search`
    - Key `query` (Type: `Text`): `[SearchQuery]`
    - Key `lang` (Type: `Text`): `en` (or `es`)
- [ ] **7. Extract Response Text:**
  - Action name: **Get Dictionary Value**
  - Get: `Value`
  - Key: `spoken_text`
  - From: `[Contents of URL]`
- [ ] **8. Speak Response:**
  - Action name: **Speak Text**
  - Text: `[Dictionary Value]`
  - Audio Options (`VERIFY ON IPHONE`): Language matching `lang` (`English (US)` or `Spanish (Mexico)`), Rate: Normal, Pitch: Normal.
- [ ] **9. Show Visual Result Card:**
  - Action name: **Show Result**
  - Text: `[Dictionary Value]` (shows system banner / modal with search snippet).

---

### Shortcut 2: Inventory Count (`intent: "count"`)

* **Siri Voice Phrases:**
  - English: *"Inventory count"* / *"Count Onyx items"*
  - Spanish: *"Conteo de inventario"* / *"Contar inventario"*
* **Function Payload:** `{"intent": "count", "query": "<input>", "lang": "en" | "es"}`

#### Step-by-Step Actions:
- [ ] **1. Create New Shortcut:** Tap the **+** button in the Shortcuts app.
- [ ] **2. Rename Shortcut:** Name it `Inventory count` (or `Conteo de inventario`).
- [ ] **3. Ask for Input:**
  - Action name: **Ask for Input**
  - Prompt: *"Count which status or filter? (Leave blank for total):"* (or *"¿Qué categoría o estatus contar? (deja en blanco para total):"*)
  - Input Type: `Text`
- [ ] **4. Set Variable:**
  - Action name: **Set Variable**
  - Variable Name: `FilterQuery`
  - Value: `[Provided Input]`
- [ ] **5. Get Auth Token:**
  - Action name: **Run Shortcut** -> `Onyx Auth Token`
  - Output: `authToken`
- [ ] **6. HTTP Request:**
  - Action name: **Get Contents of URL**
  - URL: `https://<project>.supabase.co/functions/v1/siri-inventory`
  - Method: `POST`
  - **Headers:**
    - `Authorization`: `Bearer [authToken]`
    - `Content-Type`: `application/json`
    - `apikey`: `<anon-key>`
  - **Request Body:** Select `JSON`
    - Key `intent` (Type: `Text`): `count`
    - Key `query` (Type: `Text`): `[FilterQuery]`
    - Key `lang` (Type: `Text`): `en` (or `es`)
- [ ] **7. Extract Response Text:**
  - Action name: **Get Dictionary Value**
  - Key: `spoken_text`
  - From: `[Contents of URL]`
- [ ] **8. Speak Response:**
  - Action name: **Speak Text**
  - Text: `[Dictionary Value]`
- [ ] **9. Show Notification / Summary:**
  - Action name: **Show Result**
  - Text: `[Dictionary Value]`

---

### Shortcut 3: Item Details & Barcode Lookup (`intent: "item"`)

* **Siri Voice Phrases:**
  - English: *"Item details"* / *"Look up item"*
  - Spanish: *"Detalle del artículo"* / *"Buscar código"*
* **Function Payload:** `{"intent": "item", "query": "<id-or-barcode>", "lang": "en" | "es"}`

#### Step-by-Step Actions:
- [ ] **1. Create New Shortcut:** Tap the **+** button in the Shortcuts app.
- [ ] **2. Rename Shortcut:** Name it `Item details` (or `Detalle del artículo`).
- [ ] **3. Ask for Input:**
  - Action name: **Ask for Input**
  - Prompt: *"What is the item ID or barcode?"* (or *"¿Cuál es el código del artículo?"*)
  - Input Type: `Text`
- [ ] **4. Set Variable:**
  - Action name: **Set Variable**
  - Variable Name: `ItemTag`
  - Value: `[Provided Input]`
- [ ] **5. Get Auth Token:**
  - Action name: **Run Shortcut** -> `Onyx Auth Token`
  - Output: `authToken`
- [ ] **6. HTTP Request:**
  - Action name: **Get Contents of URL**
  - URL: `https://<project>.supabase.co/functions/v1/siri-inventory`
  - Method: `POST`
  - **Headers:**
    - `Authorization`: `Bearer [authToken]`
    - `Content-Type`: `application/json`
    - `apikey`: `<anon-key>`
  - **Request Body:** Select `JSON`
    - Key `intent` (Type: `Text`): `item`
    - Key `query` (Type: `Text`): `[ItemTag]`
    - Key `lang` (Type: `Text`): `en` (or `es`)
- [ ] **7. Extract Spoken Text:**
  - Action name: **Get Dictionary Value**
  - Key: `spoken_text`
  - From: `[Contents of URL]`
- [ ] **8. Speak Response:**
  - Action name: **Speak Text**
  - Text: `[Dictionary Value]`
- [ ] **9. Show Image (Optional enhancement if image is returned):**
  - Action name: **Get Dictionary Value** for key `image_url` from `[Contents of URL]`
  - Action name: **If** `[Dictionary Value (image_url)]` has any value:
    - Action name: **Get Contents of URL** `[Dictionary Value (image_url)]`
    - Action name: **Show Result** `[Contents of URL]` (`VERIFY ON IPHONE: Quick Look / Show Result photo rendering`)
  - Action name: **End If**

---

## 4. What Each Role Hears (Role & Money Policy)

Role enforcement happens entirely inside the Supabase Edge Function based on the caller's verified row in `app_users`.

### 4.1 Finance Roles (`FINANCE_ROLES`)
**Roles:** `Developer`, `Admin`, `ClientBoss`, `ClientAccounting`
* **What they hear:**
  - Physical specs, warehouse status, dimensions, materials, and crate locations.
  - Full pricing details, including MXN prices (`$1,250.00 MXN`) and USD book retail (`$75.00 USD`).
  - Responses to queries containing financial terms (*"price"*, *"cost"*, *"precio"*, *"cuánto cuesta"*).

### 4.2 Non-Finance Staff & External Roles
**Roles:** `ClientViewer`, `Vendor`, `Client`
* **What they hear:**
  - Standard inventory data: status, dimensions, piece counts, material names, and item IDs.
  - All `COST_COLUMNS` (`price_mxn`, `book_acquisition`, `book_landed`, `book_aq_code`, `book_land_code`) are server-stripped.
  - If a financial term is spoken, the server immediately returns a polite spoken refusal:
    - **English:** *"Prices and financial data are only available to Onyx finance roles."*
    - **Spanish:** *"Los precios y datos financieros solo están disponibles para los roles de finanzas de Onyx."*

---

## 5. Revocation & Lost Device Procedure

Because an iPhone Shortcut stores or caches tokens on the local device, execute the following protocol if a device is misplaced, stolen, or an employee changes roles:

### 5.1 Immediate Access Revocation (Server Admin)
1. **Disable User in `app_users`:**
   - Run query in Supabase SQL editor or toggle active status in the Onyx admin UI:
     ```sql
     UPDATE public.app_users
     SET active = false, is_active = false
     WHERE email = 'user@example.com';
     ```
   - The Edge Function checks `appUser.active !== false && appUser.is_active !== false`. Calls will immediately return `403 Forbidden` on the very next voice query.
2. **Terminate Supabase Sessions:**
   - In Supabase Dashboard -> **Authentication** -> **Users** -> select user -> **Sign out user**.
   - This invalidates the refresh token, blocking subsequent token exchanges.

### 5.2 Lost iPhone Protocol
- [ ] Trigger **Lost Mode** or **Remote Wipe** via Apple iCloud **Find My** (`icloud.com/find`).
- [ ] Change user password in Supabase Auth to invalidate all client session tokens.
- [ ] If an app-specific token table is later introduced, delete the row corresponding to the device token ID.

---

## 6. Troubleshooting Guide

| Symptom / Code | Root Cause | iPhone Fix / Verification Step |
| :--- | :--- | :--- |
| **`401 Unauthorized`** | Missing or expired access token (JWT), or malformed `Authorization: Bearer` header. | In the Shortcut, re-run the `Onyx Auth Token` flow. Verify that the variable in the header includes the word `Bearer ` with a space before the token. |
| **`403 Forbidden`** | Account inactive or missing from `app_users`. | Confirm user email exists in `app_users` table and both `active` and `is_active` flags are `true`. |
| **`429 Rate Limit Exceeded`** | Exceeded the 30 requests/minute per-user threshold. | Wait at least 60 seconds before triggering the Shortcut again. |
| **Empty Answer / Silence** | The `spoken_text` key was not found or was empty in the JSON response. | Open the Shortcut editor, add a temporary **Quick Look** action right after **Get Contents of URL** to inspect the raw JSON (`VERIFY ON IPHONE`). |
| **Wrong Spoken Language** | The Shortcut sent `lang: "en"` when Spanish was desired, or Siri's TTS voice is misconfigured. | In the Shortcut's JSON request body, verify `lang` is set to `"es"`. In **Speak Text**, verify the voice language is set to `Spanish (Mexico)` (`VERIFY ON IPHONE`). |
| **Truncated List Spoken** | Search matches exceed 5 items. | Expected behavior. Server limits spoken items to 5 to keep Siri concise, and mentions *"Showing 5... X more items exist."* |
| **No Sound from Siri** | iPhone is in Silent Mode, volume is down, or audio routing is off. | Flick the hardware Ring/Silent switch on the iPhone, raise media volume while Shortcut is running, or check Bluetooth audio connection (`VERIFY ON IPHONE`). |
| **Shortcut asks permission every time** | iOS Shortcuts privacy settings require approval before sending data to external domains. | Open the Shortcut settings (tap `(i)` at the bottom or the dropdown), go to **Privacy**, and select **Always Allow** for the Supabase function domain (`VERIFY ON IPHONE`). |

---

## 7. Items Requiring Verification on iPhone (`VERIFY ON IPHONE`)

The following items depend on exact iOS version behaviors and must be verified directly on the physical iPhone:

1. `VERIFY ON IPHONE`: **Siri & Search Language Settings** — Confirm the configured Siri voice recognizes the exact trigger phrases in Mexican Spanish and US English without phonetic misinterpretation.
2. `VERIFY ON IPHONE`: **Shortcuts iCloud Drive File Path** — Confirm `Shortcuts/onyx_refresh_token.txt` is created inside the sandbox folder without prompting for full file system permissions.
3. `VERIFY ON IPHONE`: **Document Picker & Overwrite Toggle** — Confirm **Save File** has "Overwrite If File Exists" enabled without popping up an interactive iOS confirmation modal.
4. `VERIFY ON IPHONE`: **Prompt Input Action Menu** — Verify **Ask for Input** dialog layout when Siri executes hands-free via voice prompt versus screen tap.
5. `VERIFY ON IPHONE`: **Run Shortcut Integration** — Confirm nested execution of `Onyx Auth Token` returns the string variable cleanly to the parent Shortcut.
6. `VERIFY ON IPHONE`: **Shortcut Renaming for Siri Activation** — Confirm changing the shortcut display title in iOS Shortcuts immediately updates Siri's trigger phrase.
7. `VERIFY ON IPHONE`: **Speak Text Language & Pitch Options** — Validate that the localized voice accent (`es-MX` / `en-US`) overrides the system default cleanly.
8. `VERIFY ON IPHONE`: **Quick Look / Image Rendering in Show Result** — Confirm `Show Result` or `Quick Look` renders product cutout thumbnails from the `image_url` without erroring on remote HTTPS URLs.
9. `VERIFY ON IPHONE`: **Always Allow Network Privacy Permission** — Confirm the one-time network permission prompt for `<project>.supabase.co` can be permanently granted via shortcut privacy settings.
