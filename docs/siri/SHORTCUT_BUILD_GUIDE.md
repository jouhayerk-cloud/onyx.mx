# Siri Shortcuts Build Guide (iPhone Direct Setup)

**Document Version:** 2.0.0  
**Date:** 2026-10-10  
**Author / Target:** Ramses (Manual build on iPhone without Mac)  
**Endpoint Target:** `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/siri-inventory`  
**Review Status:** Pending Review by Ramses

---

## 1. What You Need

Before creating Shortcuts on your iPhone, verify you have the following prerequisites:

1. **iPhone Running iOS 16 or Later:** With the native **Shortcuts** app installed (pre-installed by Apple).
2. **Supabase Edge Function URL:**
   - Production URL placeholder: `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/siri-inventory`
   - Supabase project reference (`<project>`).
3. **Personal Siri Token:**
   - Generated from Onyx web app under **Settings > Siri Shortcuts**.
   - Format: `siri_` followed by 43 characters (e.g., `siri_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`).
   - Valid for 180 days from creation date.
4. **Siri Voice Enabled:**
   - English (`en-US`) or Spanish (`es-MX`) language support enabled under **Settings > Siri & Search** (`VERIFY ON IPHONE`).

---

## 2. Authentication: Personal Siri Token

Voice queries authenticate using a personal Siri token issued directly by the Onyx backend. The token carries your personal role, lasts 180 days, and avoids all mobile OAuth refresh loops.

```
[Onyx Web App: Settings > Siri Shortcuts]
       │
       ▼
[Enter Label "iPhone" -> Create Token]
       │
       ▼
[Copy raw token shown once (siri_...)]
       │
       ▼
[In Shortcut: Text action "Siri token"]
       │
       ▼
[Get Contents of URL: Authorization: Bearer <Siri token>]
       │
       ▼
[siri-inventory: Validates token & executes query with user role]
```

### 2.1 Generating Your Siri Token
1. Open the Onyx application in your browser and log in.
2. Navigate to **Settings > Siri Shortcuts**.
3. In the input box, type a descriptive label for your device (1 to 40 characters, e.g., `"iPhone"`, `"iPad Pro"`, or `"Ramses iPhone"`).
4. Tap **Create**.
5. Copy the displayed token immediately. The raw token (`siri_` + 43 characters) is shown **only once** in this response.
6. Note the quota: each person can have at most **5 active tokens**. Attempting to create a sixth returns HTTP `409 Conflict`.

### 2.2 Storing and Using the Token in Shortcuts
Every voice shortcut uses this token directly without needing to read files from iCloud Drive:

1. **Top of Shortcut:** Add a **Text** action containing your personal Siri token:
   - Action name: **Text**
   - Content: `siri_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (paste your copied token)
2. **Rename Variable / Set Variable:**
   - Action name: **Set Variable**
   - Variable Name: `Siri token`
   - Value: `[Text]`
3. **HTTP Header in Get Contents of URL:**
   - Set the header `Authorization` to:
     ```
     Bearer [Siri token]
     ```
     *(Ensure there is a single space between `Bearer` and the `[Siri token]` variable token)*.

### 2.3 Lifetime, Role Scope & Revocation
- **Role Inheritance:** The token automatically inherits your application role in `app_users`. Finance roles (`Developer`, `Admin`, `ClientBoss`, `ClientAccounting`) hear full pricing; all other roles hear physical specs and get a polite refusal for financial queries.
- **Expiration:** Tokens are valid for **180 days**. When a token expires, generate a fresh one in Settings and update the `Text` action in your Shortcut.
- **Revocation:** In **Settings > Siri Shortcuts**, you can view all your active tokens and revoke any token at any time.
- **Lost iPhone:** If your iPhone is lost or stolen, go immediately to **Settings > Siri Shortcuts** on another device and click **Revoke** next to that device's token. The token is invalidated instantly with no other changes needed.

---

## 3. Step-by-Step Build: 3 Voice Shortcuts

Below are the exact action-by-action steps to build each intent shortcut directly in the iOS Shortcuts app.

---

### Shortcut 1: Inventory Search (`intent: "search"`)

* **Siri Voice Phrases:**
  - English: *"Inventory search"* / *"Search Onyx"*
  - Spanish: *"Buscar inventario"* / *"Buscar en Onyx"*
* **Function Payload:** `{"intent": "search", "query": "<input>", "lang": "en" | "es"}`

#### Step-by-Step Actions:
- [ ] **1. Create New Shortcut:** Open the **Shortcuts** app, tap the **+** button in the top right.
- [ ] **2. Rename Shortcut:** Tap the title dropdown at the top, select **Rename**, and set name to `Inventory search` (or `Buscar inventario`) (`VERIFY ON IPHONE`).
- [ ] **3. Define Siri Token:**
  - Action name: **Text**
  - Content: Paste your personal Siri token (`siri_...`)
  - Action name: **Set Variable**
  - Variable Name: `Siri token`
  - Value: `[Text]`
- [ ] **4. Ask for Input:**
  - Action name: **Ask for Input**
  - Prompt: *"What item or stone do you want to search for?"* (or *"¿Qué artículo o material buscas?"*)
  - Input Type: `Text`
- [ ] **5. Set Variable:**
  - Action name: **Set Variable**
  - Variable Name: `SearchQuery`
  - Value: `[Provided Input]`
- [ ] **6. HTTP Request:**
  - Action name: **Get Contents of URL**
  - URL: `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/siri-inventory`
  - Method: `POST`
  - **Headers:**
    - `Authorization`: `Bearer [Siri token]`
    - `Content-Type`: `application/json`
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
- [ ] **3. Define Siri Token:**
  - Action name: **Text**
  - Content: Paste your personal Siri token (`siri_...`)
  - Action name: **Set Variable**
  - Variable Name: `Siri token`
  - Value: `[Text]`
- [ ] **4. Ask for Input:**
  - Action name: **Ask for Input**
  - Prompt: *"Count which status or filter? (Leave blank for total):"* (or *"¿Qué categoría o estatus contar? (deja en blanco para total):"*)
  - Input Type: `Text`
- [ ] **5. Set Variable:**
  - Action name: **Set Variable**
  - Variable Name: `FilterQuery`
  - Value: `[Provided Input]`
- [ ] **6. HTTP Request:**
  - Action name: **Get Contents of URL**
  - URL: `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/siri-inventory`
  - Method: `POST`
  - **Headers:**
    - `Authorization`: `Bearer [Siri token]`
    - `Content-Type`: `application/json`
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
- [ ] **3. Define Siri Token:**
  - Action name: **Text**
  - Content: Paste your personal Siri token (`siri_...`)
  - Action name: **Set Variable**
  - Variable Name: `Siri token`
  - Value: `[Text]`
- [ ] **4. Ask for Input:**
  - Action name: **Ask for Input**
  - Prompt: *"What is the item ID or barcode?"* (or *"¿Cuál es el código del artículo?"*)
  - Input Type: `Text`
- [ ] **5. Set Variable:**
  - Action name: **Set Variable**
  - Variable Name: `ItemTag`
  - Value: `[Provided Input]`
- [ ] **6. HTTP Request:**
  - Action name: **Get Contents of URL**
  - URL: `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/siri-inventory`
  - Method: `POST`
  - **Headers:**
    - `Authorization`: `Bearer [Siri token]`
    - `Content-Type`: `application/json`
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

Role enforcement happens strictly inside the Supabase Edge Function based on the token owner's active record in `app_users`.

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

Because your Siri token is stored directly in the Shortcut on your device, execute the following protocol if a device is misplaced, stolen, or an employee changes roles:

### 5.1 Immediate Token Revocation (Onyx Settings)
1. Open the Onyx app on any browser/device.
2. Go to **Settings > Siri Shortcuts**.
3. Locate the compromised device label (e.g. `"iPhone"`).
4. Click **Revoke**.
5. The token is invalidated in the database immediately. The next voice query from that device will be rejected with HTTP `401 Unauthorized`. No other change is needed.

### 5.2 Lost iPhone Protocol
- [ ] Trigger **Lost Mode** or **Remote Wipe** via Apple iCloud **Find My** (`icloud.com/find`).
- [ ] Revoke the device's Siri token in Onyx **Settings > Siri Shortcuts**.
- [ ] (Optional / Admin) If the user account itself is compromised, toggle user status in `app_users` (`active = false`).

---

## 6. Troubleshooting Guide

| Symptom / Code | Root Cause | iPhone Fix / Verification Step |
| :--- | :--- | :--- |
| **`401 Unauthorized`** | Token is incorrect, has been revoked, or expired after 180 days. | Go to Onyx **Settings > Siri Shortcuts**, generate a new token, and paste it into the `Text` action named `Siri token` at the top of the Shortcut. Ensure header has `Bearer ` with a space before the token. |
| **`403 Forbidden`** | Account inactive or disabled in `app_users`. | Confirm user email exists in `app_users` table and both `active` and `is_active` flags are `true`. |
| **`409 Conflict`** | Maximum active token quota reached (5 active tokens per user). | Open Onyx **Settings > Siri Shortcuts**, revoke an old or unused token, and then create a new token. |
| **`429 Too Many Requests`** | Exceeded the rate limit of 30 requests per minute. | Wait at least 60 seconds before triggering the Shortcut again. |
| **Empty Answer / Silence** | The `spoken_text` key was not found or was empty in the JSON response. | Open the Shortcut editor, add a temporary **Quick Look** action right after **Get Contents of URL** to inspect the raw JSON (`VERIFY ON IPHONE`). |
| **Wrong Spoken Language** | The Shortcut sent `lang: "en"` when Spanish was desired, or Siri's TTS voice is misconfigured. | In the Shortcut's JSON request body, verify `lang` is set to `"es"`. In **Speak Text**, verify the voice language is set to `Spanish (Mexico)` (`VERIFY ON IPHONE`). |
| **Truncated List Spoken** | Search matches exceed 5 items. | Expected behavior. Server limits spoken items to 5 to keep Siri concise, and mentions *"Showing 5... X more items exist."* |
| **No Sound from Siri** | iPhone is in Silent Mode, volume is down, or audio routing is off. | Flick the hardware Ring/Silent switch on the iPhone, raise media volume while Shortcut is running, or check Bluetooth audio connection (`VERIFY ON IPHONE`). |
| **Shortcut asks permission every time** | iOS Shortcuts privacy settings require approval before sending data to external domains. | Open the Shortcut settings (tap `(i)` at the bottom or the dropdown), go to **Privacy**, and select **Always Allow** for the Supabase function domain (`VERIFY ON IPHONE`). |

---

## 7. Items Requiring Verification on iPhone (`VERIFY ON IPHONE`)

The following items depend on exact iOS version behaviors and must be verified directly on the physical iPhone:

1. `VERIFY ON IPHONE`: **Siri & Search Language Settings** — Confirm the configured Siri voice recognizes the exact trigger phrases in Mexican Spanish and US English without phonetic misinterpretation.
2. `VERIFY ON IPHONE`: **Prompt Input Action Menu** — Verify **Ask for Input** dialog layout when Siri executes hands-free via voice prompt versus screen tap.
3. `VERIFY ON IPHONE`: **Shortcut Renaming for Siri Activation** — Confirm changing the shortcut display title in iOS Shortcuts immediately updates Siri's trigger phrase.
4. `VERIFY ON IPHONE`: **Speak Text Language & Pitch Options** — Validate that the localized voice accent (`es-MX` / `en-US`) overrides the system default cleanly.
5. `VERIFY ON IPHONE`: **Quick Look / Image Rendering in Show Result** — Confirm `Show Result` or `Quick Look` renders product cutout thumbnails from the `image_url` without erroring on remote HTTPS URLs.
6. `VERIFY ON IPHONE`: **Always Allow Network Privacy Permission** — Confirm the one-time network permission prompt for `yircifkayqpuydfdqzlm.supabase.co` can be permanently granted via shortcut privacy settings.

---

## 8. Legacy / Alternative Flow Note

The standard Supabase Auth password and OAuth refresh token exchange flow (`/auth/v1/token?grant_type=refresh_token`) exists in Supabase, but is not used for Onyx Siri Shortcuts. Mobile refresh token flows in Apple Shortcuts require reading and writing token cache files to iCloud Drive, handle expiration unpredictably during hands-free queries, and fail when offline or during transient OAuth rotation desyncs. The dedicated personal Siri token (`siri_` + 43 characters, 180-day lifespan, 1-click web revocation) provides a significantly more dependable, tamper-evident voice interface.
