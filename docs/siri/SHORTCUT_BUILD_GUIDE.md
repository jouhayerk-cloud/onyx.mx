# Siri Shortcuts Build Guide (iPhone Direct Setup)

**Document Version:** 2.1.0  
**Date:** 2026-10-10  
**Author / Target:** Ramses (Manual build on iPhone without Mac)  
**Endpoint Target:** `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/siri-inventory`  
**Review Status:** Pending Review by Ramses

---

## Quick Version (Shortcut 1 in 60 Seconds)

1. **Action chain:** Text (paste token) → Set Variable (`Siri token`) → Ask for Input (`SearchQuery`) → Set Variable → Get Contents of URL → Get Dictionary Value (`spoken_text`) → Speak Text → Show Result.
2. **Show More:** Tap **Show More** inside Get Contents of URL to reveal Method, Headers, and Request Body.
3. **Endpoint & Method:** Set URL to `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/siri-inventory` and Method to `POST`.
4. **Headers:** Add `Authorization: Bearer [Siri token]` and `Content-Type: application/json`.
5. **Body fields (JSON):** Set Request Body to JSON with 3 fields: `intent` (`"search"`), `query` (`[SearchQuery]`), and `lang` (`"en"` or `"es"`).
6. **Privacy prompt:** On first run, tap **Always Allow** when iOS prompts for network permission (or manage under shortcut Details > Privacy).

---

## 1. What You Need

Before creating Shortcuts on your iPhone, verify you have the following prerequisites:

1. **iPhone Running iOS 16 or Later:** With the native **Shortcuts** app installed (pre-installed by Apple) (`VERIFY ON IPHONE`: tested against iOS 27 per Apple documentation A14; minimum iOS version unverified).
2. **Supabase Edge Function URL:**
   - Production URL placeholder: `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/siri-inventory`
   - Supabase project reference (`<project>`).
3. **Personal Siri Token:**
   - Generated from Onyx web app under **Settings > Siri Shortcuts**.
   - Format: `siri_` followed by 43 characters (e.g., `siri_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`).
   - Valid for 180 days from creation date.
4. **Siri Voice Enabled:**
   - English (`en-US`) or Spanish (`es-MX`) language support enabled under **Settings > Siri** (or **Apple Intelligence & Siri** on newer iOS versions), then **Language** (Apple A12). Note that Siri Voice is a separate setting. Hands-free "Hey Siri" Spanish (Mexico) trigger is a known risk to test (`VERIFY ON IPHONE`: Apple lists Spanish (Mexico) for certain features like on-device speech processing, but not under Activate with Siri per A14; Siri AI Spanish is in beta per N1).

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
2. **Set Variable:**
   - Action name: **Set Variable** (Apple A4)
   - Variable Name: `Siri token`
   - Value: `[Text]` (tap the Magic Variable / blue token from the Text action per Apple A4)
3. **HTTP Header in Get Contents of URL:**
   - Set the header `Authorization` to:
     ```
     Bearer [Siri token]
     ```
     *(Ensure there is a single space between `Bearer` and the `[Siri token]` variable token; `VERIFY ON IPHONE`: inserting variable into HTTP header value field via Variables bar per Apple A4)*.

### 2.3 Lifetime, Role Scope & Revocation
- **Role Inheritance:** The token automatically inherits your application role in `app_users`. Finance roles (`Developer`, `Admin`, `ClientBoss`, `ClientAccounting`) hear full pricing; all other roles hear physical specs and get a polite refusal for financial queries.
- **Expiration:** Tokens are valid for **180 days**. When a token expires, generate a fresh one in Settings and update the `Text` action in your Shortcut.
- **Revocation:** In **Settings > Siri Shortcuts**, you can view all your active tokens and revoke any token at any time.
- **Lost iPhone:** If your iPhone is lost or stolen, go immediately to **Settings > Siri Shortcuts** on another device and click **Revoke** next to that device's token. The token is invalidated instantly with no other changes needed.

---

## 3. Step-by-Step Build: 4 Voice Shortcuts

Below are the exact action-by-action steps to build each intent shortcut directly in the iOS Shortcuts app.

---

### Shortcut 1: Inventory Search (`intent: "search"`)

* **Siri Voice Phrases:**
  - English primary trigger: *"Inventory search"* (the shortcut name is the native Siri voice trigger per Apple A3; additional trigger phrases such as *"Search Onyx"* must be recorded separately via Add to Siri per Apple A13).
  - Spanish primary trigger: *"Buscar inventario"* (shortcut name is the native voice trigger; additional phrases like *"Buscar en Onyx"* require separate Add to Siri recording; `VERIFY ON IPHONE`: hands-free Spanish trigger per A14/N1).
* **Function Payload:** `{"intent": "search", "query": "<input>", "lang": "en" | "es"}`

#### Step-by-Step Actions:
- [ ] **1. Create New Shortcut:** Open the **Shortcuts** app, tap the **Add button (+)** (Apple A8; corner position unverified).
- [ ] **2. Rename Shortcut:** Tap **New Shortcut**, tap **Rename**, type the name `Inventory search` (or `Buscar inventario`), then tap the back-button icon (or Done on older iOS versions per Apple A8).
- [ ] **3. Define Siri Token:**
  - Action name: **Text**
  - Content: Paste your personal Siri token (`siri_...`)
  - Action name: **Set Variable** (Apple A4)
  - Variable Name: `Siri token`
  - Value: `[Text]` (tap the Magic Variable / blue token from the Text action per Apple A4)
- [ ] **4. Ask for Input:**
  - Action name: **Ask for Input**
  - Prompt: *"What item or stone do you want to search for?"* (or *"¿Qué artículo o material buscas?"*)
  - Input Type: `Text` (`VERIFY ON IPHONE`: Apple documentation A2 specifies words, dates, or numbers; verify exact input type menu label on device)
- [ ] **5. Set Variable:**
  - Action name: **Set Variable**
  - Variable Name: `SearchQuery`
  - Value: `[Provided Input]` (`VERIFY ON IPHONE`: Ask for Input output is passed as a Magic Variable; verify exact token label such as "Provided Input" on device per Apple A2)
- [ ] **6. HTTP Request:**
  - Action name: **Get Contents of URL**
  - URL: `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/siri-inventory`
  - Advanced Options: Tap **Show More** in the action to reveal Method, Headers, and Request Body (Apple A1).
  - Method: `POST`
  - **Headers:** (`VERIFY ON IPHONE`: tap "+ Add new header" under Show More; verify header field placement and variable insertion on device)
    - `Authorization`: `Bearer [Siri token]` (single space after Bearer; `VERIFY ON IPHONE`: variable insertion in header field per Apple A4)
    - `Content-Type`: `application/json`
  - **Request Body:** Select `JSON` (appears once Method is set to POST, PUT, or PATCH; options are JSON, Form, or File per Apple A1)
    - Key `intent` (Type: `Text`): `search`
    - Key `query` (Type: `Text`): `[SearchQuery]`
    - Key `lang` (Type: `Text`): `en` (or `es`)
    - *Note on Key Types:* Choose the type from the menu on the iPhone; use Number only where the API expects a JSON number (`VERIFY ON IPHONE`: JSON key-type menu labels).
- [ ] **7. Extract Response Text:**
  - Action name: **Get Dictionary Value** (Apple A9)
  - Get: `Value`
  - Key: `spoken_text`
  - From: `[Contents of URL]` (`VERIFY ON IPHONE`: field labels may read "Get [Value] for [spoken_text] in [Contents of URL]")
- [ ] **8. Speak Response:**
  - Action name: **Speak Text**
  - Text: `[Dictionary Value]`
  - Audio Options: Language matching `lang` (`English (US)` or `Spanish (Mexico)`), Rate, Pitch (`VERIFY ON IPHONE`: Rate and Pitch are slider controls rather than "Normal" presets; verify presence of Spanish (Mexico) in Language picker and available voices on device per S2/A14).
- [ ] **9. Show Visual Result:**
  - Action name: **Show Result**
  - Text: `[Dictionary Value]` (shows the text in Siri or in an alert; tapping the result opens a full-screen Quick Look per S3; `VERIFY ON IPHONE`: banner presentation is undocumented; verify visual alert layout on device).

---

### Workflow Tip: Duplicate Shortcuts (Apple A7)
To save time when building Shortcuts 2, 3, and 4, you can duplicate Shortcut 1 rather than starting from scratch: in the Shortcuts library, touch and hold Shortcut 1 and tap **Duplicate** (or tap **Edit**, select Shortcut 1 with a checkmark, and tap **Duplicate** per Apple A7). Rename the duplicate and modify only the prompts, variable names, and JSON body keys (`VERIFY ON IPHONE`: default name assigned to duplicate shortcut).

---

### Shortcut 2: Inventory Count (`intent: "count"`)

* **Siri Voice Phrases:**
  - English primary trigger: *"Inventory count"* (the shortcut name is the native Siri voice trigger per Apple A3; additional trigger phrases such as *"Count Onyx items"* must be recorded separately via Add to Siri per Apple A13).
  - Spanish primary trigger: *"Conteo de inventario"* (shortcut name is the native voice trigger; additional phrases like *"Contar inventario"* require separate Add to Siri recording; `VERIFY ON IPHONE`: hands-free Spanish trigger per A14/N1).
* **Function Payload:** `{"intent": "count", "query": "<input>", "lang": "en" | "es"}`

#### Step-by-Step Actions:
- [ ] **1. Create New Shortcut:** Open the **Shortcuts** app, tap the **Add button (+)** (or duplicate Shortcut 1 per Apple A7).
- [ ] **2. Rename Shortcut:** Tap **New Shortcut**, tap **Rename**, type the name `Inventory count` (or `Conteo de inventario`), then tap the back-button icon (or Done).
- [ ] **3. Define Siri Token:**
  - Action name: **Text**
  - Content: Paste your personal Siri token (`siri_...`)
  - Action name: **Set Variable** (Apple A4)
  - Variable Name: `Siri token`
  - Value: `[Text]` (tap the Magic Variable / blue token from the Text action per Apple A4)
- [ ] **4. Ask for Input:**
  - Action name: **Ask for Input**
  - Prompt: *"Count which status or filter? (Leave blank for total):"* (or *"¿Qué categoría o estatus contar? (deja en blanco para total):"*)
  - Input Type: `Text` (`VERIFY ON IPHONE`: input type menu label per Apple A2)
- [ ] **5. Set Variable:**
  - Action name: **Set Variable**
  - Variable Name: `FilterQuery`
  - Value: `[Provided Input]` (`VERIFY ON IPHONE`: Magic Variable label per Apple A2)
- [ ] **6. HTTP Request:**
  - Action name: **Get Contents of URL**
  - URL: `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/siri-inventory`
  - Advanced Options: Tap **Show More** in the action to reveal Method, Headers, and Request Body (Apple A1).
  - Method: `POST`
  - **Headers:** (`VERIFY ON IPHONE`: tap "+ Add new header" under Show More; verify header field placement and variable insertion on device)
    - `Authorization`: `Bearer [Siri token]` (single space after Bearer; `VERIFY ON IPHONE`: variable insertion in header field per Apple A4)
    - `Content-Type`: `application/json`
  - **Request Body:** Select `JSON` (appears once Method is set to POST, PUT, or PATCH per Apple A1)
    - Key `intent` (Type: `Text`): `count`
    - Key `query` (Type: `Text`): `[FilterQuery]`
    - Key `lang` (Type: `Text`): `en` (or `es`)
    - *Note on Key Types:* Choose the type from the menu on the iPhone; use Number only where the API expects a JSON number (`VERIFY ON IPHONE`: JSON key-type menu labels).
- [ ] **7. Extract Response Text:**
  - Action name: **Get Dictionary Value** (Apple A9)
  - Get: `Value`
  - Key: `spoken_text`
  - From: `[Contents of URL]` (`VERIFY ON IPHONE`: field labels may read "Get [Value] for [spoken_text] in [Contents of URL]")
- [ ] **8. Speak Response:**
  - Action name: **Speak Text**
  - Text: `[Dictionary Value]`
  - Audio Options: Language matching `lang` (`English (US)` or `Spanish (Mexico)`), Rate, Pitch (`VERIFY ON IPHONE`: Rate/Pitch slider controls per S2/A14).
- [ ] **9. Show Result:**
  - Action name: **Show Result** (Apple A11)
  - Text: `[Dictionary Value]` (shows text in Siri or in an alert per S3; `VERIFY ON IPHONE`: alert layout).

---

### Shortcut 3: Item Details & Barcode Lookup (`intent: "item"`)

* **Siri Voice Phrases:**
  - English primary trigger: *"Item details"* (the shortcut name is the native Siri voice trigger per Apple A3; additional trigger phrases such as *"Look up item"* must be recorded separately via Add to Siri per Apple A13).
  - Spanish primary trigger: *"Detalle del artículo"* (shortcut name is the native voice trigger; additional phrases like *"Buscar código"* require separate Add to Siri recording; `VERIFY ON IPHONE`: hands-free Spanish trigger per A14/N1).
* **Function Payload:** `{"intent": "item", "query": "<id-or-barcode>", "lang": "en" | "es"}`

#### Step-by-Step Actions:
- [ ] **1. Create New Shortcut:** Open the **Shortcuts** app, tap the **Add button (+)** (or duplicate Shortcut 1 per Apple A7).
- [ ] **2. Rename Shortcut:** Tap **New Shortcut**, tap **Rename**, type the name `Item details` (or `Detalle del artículo`), then tap the back-button icon (or Done).
- [ ] **3. Define Siri Token:**
  - Action name: **Text**
  - Content: Paste your personal Siri token (`siri_...`)
  - Action name: **Set Variable** (Apple A4)
  - Variable Name: `Siri token`
  - Value: `[Text]` (tap the Magic Variable / blue token from the Text action per Apple A4)
- [ ] **4. Ask for Input:**
  - Action name: **Ask for Input**
  - Prompt: *"What is the item ID or barcode?"* (or *"¿Cuál es el código del artículo?"*)
  - Input Type: `Text` (`VERIFY ON IPHONE`: input type menu label per Apple A2)
- [ ] **5. Set Variable:**
  - Action name: **Set Variable**
  - Variable Name: `ItemTag`
  - Value: `[Provided Input]` (`VERIFY ON IPHONE`: Magic Variable label per Apple A2)
- [ ] **6. HTTP Request:**
  - Action name: **Get Contents of URL**
  - URL: `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/siri-inventory`
  - Advanced Options: Tap **Show More** in the action to reveal Method, Headers, and Request Body (Apple A1).
  - Method: `POST`
  - **Headers:** (`VERIFY ON IPHONE`: tap "+ Add new header" under Show More; verify header field placement and variable insertion on device)
    - `Authorization`: `Bearer [Siri token]` (single space after Bearer; `VERIFY ON IPHONE`: variable insertion in header field per Apple A4)
    - `Content-Type`: `application/json`
  - **Request Body:** Select `JSON` (appears once Method is set to POST, PUT, or PATCH per Apple A1)
    - Key `intent` (Type: `Text`): `item`
    - Key `query` (Type: `Text`): `[ItemTag]`
    - Key `lang` (Type: `Text`): `en` (or `es`)
    - *Note on Key Types:* Choose the type from the menu on the iPhone; use Number only where the API expects a JSON number (`VERIFY ON IPHONE`: JSON key-type menu labels).
- [ ] **7. Extract Spoken Text:**
  - Action name: **Get Dictionary Value** (Apple A9)
  - Get: `Value`
  - Key: `spoken_text`
  - From: `[Contents of URL]` (`VERIFY ON IPHONE`: field labels may read "Get [Value] for [spoken_text] in [Contents of URL]")
- [ ] **8. Speak Response:**
  - Action name: **Speak Text**
  - Text: `[Dictionary Value]`
  - Audio Options: Language matching `lang` (`English (US)` or `Spanish (Mexico)`), Rate, Pitch (`VERIFY ON IPHONE`: Rate/Pitch slider controls per S2/A14).
- [ ] **9. Show Image (Optional enhancement if image is returned):**
  - Action name: **Get Dictionary Value** (Get: `Value`) for key `image_url` from `[Contents of URL]`
  - Action name: **If** `[Dictionary Value (image_url)]` has any value (`VERIFY ON IPHONE`: If action condition syntax "has any value" and block nesting on iOS):
    - Action name: **Get Contents of URL** `[Dictionary Value (image_url)]`
    - Action name: **Show Result** `[Contents of URL]` (`VERIFY ON IPHONE`: Quick Look / Show Result photo rendering from URL per S3/S4)
  - Action name: **End If**

---

### Shortcut 4: Vendor Count (`intent: "vendor"`)

* **Siri Voice Phrases:**
  - English primary trigger: *"Vendor count"* (the shortcut name is the native Siri voice trigger per Apple A3; additional trigger phrases such as *"Pieces from vendor"* / *"How many pieces from vendor EM"* must be recorded separately via Add to Siri per Apple A13).
  - Spanish primary trigger: *"Conteo por proveedor"* (shortcut name is the native voice trigger; additional phrases like *"Piezas por proveedor"* / *"Cuántas piezas del proveedor JM"* require separate Add to Siri recording; `VERIFY ON IPHONE`: hands-free Spanish trigger per A14/N1).
* **Function Payload:** `{"intent": "vendor", "query": "<vendor-code-or-phrase>", "lang": "en" | "es"}`

#### Step-by-Step Actions:
- [ ] **1. Create New Shortcut:** Open the **Shortcuts** app, tap the **Add button (+)** (or duplicate Shortcut 1 per Apple A7).
- [ ] **2. Rename Shortcut:** Tap **New Shortcut**, tap **Rename**, type the name `Vendor count` (or `Conteo por proveedor`), then tap the back-button icon (or Done).
- [ ] **3. Define Siri Token:**
  - Action name: **Text**
  - Content: Paste your personal Siri token (`siri_...`)
  - Action name: **Set Variable** (Apple A4)
  - Variable Name: `Siri token`
  - Value: `[Text]` (tap the Magic Variable / blue token from the Text action per Apple A4)
- [ ] **4. Ask for Input:**
  - Action name: **Ask for Input**
  - Prompt: *"Which vendor code? (e.g. EM, JM, SU):"* (or *"¿Cuál código de proveedor? (ej. EM, JM, SU):"*)
  - Input Type: `Text` (`VERIFY ON IPHONE`: input type menu label per Apple A2)
- [ ] **5. Set Variable:**
  - Action name: **Set Variable**
  - Variable Name: `VendorQuery`
  - Value: `[Provided Input]` (`VERIFY ON IPHONE`: Magic Variable label per Apple A2)
- [ ] **6. HTTP Request:**
  - Action name: **Get Contents of URL**
  - URL: `https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/siri-inventory`
  - Advanced Options: Tap **Show More** in the action to reveal Method, Headers, and Request Body (Apple A1).
  - Method: `POST`
  - **Headers:** (`VERIFY ON IPHONE`: tap "+ Add new header" under Show More; verify header field placement and variable insertion on device)
    - `Authorization`: `Bearer [Siri token]` (single space after Bearer; `VERIFY ON IPHONE`: variable insertion in header field per Apple A4)
    - `Content-Type`: `application/json`
  - **Request Body:** Select `JSON` (appears once Method is set to POST, PUT, or PATCH per Apple A1)
    - Key `intent` (Type: `Text`): `vendor`
    - Key `query` (Type: `Text`): `[VendorQuery]`
    - Key `lang` (Type: `Text`): `en` (or `es`)
    - *Note on Key Types:* Choose the type from the menu on the iPhone; use Number only where the API expects a JSON number (`VERIFY ON IPHONE`: JSON key-type menu labels).
- [ ] **7. Extract Response Text:**
  - Action name: **Get Dictionary Value** (Apple A9)
  - Get: `Value`
  - Key: `spoken_text`
  - From: `[Contents of URL]` (`VERIFY ON IPHONE`: field labels may read "Get [Value] for [spoken_text] in [Contents of URL]")
- [ ] **8. Speak Response:**
  - Action name: **Speak Text**
  - Text: `[Dictionary Value]`
  - Audio Options: Language matching `lang` (`English (US)` or `Spanish (Mexico)`), Rate, Pitch (`VERIFY ON IPHONE`: Rate/Pitch slider controls per S2/A14).
- [ ] **9. Show Result:**
  - Action name: **Show Result** (Apple A11)
  - Text: `[Dictionary Value]` (shows text in Siri or in an alert per S3; `VERIFY ON IPHONE`: alert layout).

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
| **Empty Answer / Silence** | The `spoken_text` key was not found or was empty in the JSON response. | Open the Shortcut editor, add a temporary **Quick Look** action right after **Get Contents of URL** to inspect the raw JSON (Quick Look displays text/images flowing between actions per Apple documentation A10; `VERIFY ON IPHONE` for file rendering). |
| **Wrong Spoken Language** | The Shortcut sent `lang: "en"` when Spanish was desired, or Siri's TTS voice is misconfigured. | In the Shortcut's JSON request body, verify `lang` is set to `"es"`. In **Speak Text**, verify the voice language is set to `Spanish (Mexico)` (`VERIFY ON IPHONE`: Rate/Pitch slider controls and Spanish voice picker; hands-free Spanish trigger has limited support per Apple A14 / N1). |
| **Truncated List Spoken** | Search matches exceed 5 items. | Expected behavior. Server limits spoken items to 5 to keep Siri concise, and mentions *"Showing 5... X more items exist."* |
| **No Sound from Siri** | iPhone is in Silent Mode, volume is down, or audio routing is off. | Flick the hardware Ring/Silent switch on the iPhone, raise media volume while Shortcut is running, or check Bluetooth audio connection (`VERIFY ON IPHONE`). |
| **Shortcut asks permission every time** | iOS Shortcuts privacy settings require approval before sending data to external endpoints. | Open the shortcut's Details (tap `(i)` or dropdown), tap **Privacy**, or when prompted at runtime choose **Always Allow** (dialog offers Allow Once, Always Allow, Don't Allow per Apple A5; per-domain settings are undocumented; `VERIFY ON IPHONE`: confirm exact runtime dialog text seen on device). |

---

## 7. Items Requiring Verification on iPhone (`VERIFY ON IPHONE`)

The following items depend on exact iOS version behaviors and must be verified directly on the physical iPhone:

1. `VERIFY ON IPHONE`: **Siri Language & Hands-Free Activation** — Confirm whether the configured Siri voice recognizes trigger phrases in Mexican Spanish and US English without phonetic misinterpretation. Apple documentation (A14) lists Spanish (Mexico) for certain features (on-device speech, type to Siri) but not under "Activate with Siri", and Siri AI Spanish is in beta (N1); test hands-free Spanish invocation directly on device.
2. `VERIFY ON IPHONE`: **Prompt Input Action Menu & Voice Behavior** — Verify **Ask for Input** dialog layout and whether Siri speaks the prompt and accepts spoken answers hands-free versus requiring a screen tap (S7 suggests voice is accepted; Apple docs A2/A3 are silent). Also confirm picker menu labels (words/dates/numbers per Apple A2 vs Text/Number).
3. `VERIFY ON IPHONE`: **Shortcut Renaming vs Siri Activation Phrase** — The shortcut display name is its native voice trigger (Apple A3). Confirm whether changing the shortcut name updates an already-recorded custom phrase, or if additional phrases must be re-recorded in Add to Siri (Apple A13).
4. `VERIFY ON IPHONE`: **Speak Text Options & Voices** — Validate that Rate and Pitch operate as slider controls rather than "Normal" presets (S2), and that the localized voice accent (`es-MX` / `en-US`) overrides the system default cleanly.
5. `VERIFY ON IPHONE`: **Show Result & Quick Look Photo Rendering** — Confirm `Show Result` displays text in Siri or in an alert and that tapping opens full-screen Quick Look (S3). Confirm whether `Quick Look` or `Show Result` properly renders product images from `image_url` without erroring on remote HTTPS URLs (S3, S4, Apple A10).
6. `VERIFY ON IPHONE`: **Privacy Permission Dialog Options** — Confirm which dialog text appears and which option is chosen when the shortcut contacts the Supabase endpoint (Apple documentation A5 specifies "Allow Once", "Always Allow", "Don't Allow"; per-domain settings are undocumented; verify exact prompt on device).
7. `VERIFY ON IPHONE`: **Headers & Variable Insertion** — Confirm the location of Headers under Show More (S1: "+ Add new header") and whether magic variables can be inserted into HTTP header value fields via the Variables bar (Apple A4 verified for text fields; header behavior unverified).
8. `VERIFY ON IPHONE`: **JSON Key Type Picker & Dictionary Value Syntax** — Confirm the exact menu labels for JSON key types (Text, Number, etc.) and Get Dictionary Value field labels ("Get [Value] for [key] in [Dictionary]" vs "From") on device.

---

## 8. Legacy / Alternative Flow Note

The standard Supabase Auth password and OAuth refresh token exchange flow (`/auth/v1/token?grant_type=refresh_token`) exists in Supabase, but is not used for Onyx Siri Shortcuts. Mobile refresh token flows in Apple Shortcuts require reading and writing token cache files to iCloud Drive, handle expiration unpredictably during hands-free queries, and fail when offline or during transient OAuth rotation desyncs. The dedicated personal Siri token (`siri_` + 43 characters, 180-day lifespan, 1-click web revocation) provides a significantly more dependable, tamper-evident voice interface.
