# Onyx.mx iOS Companion Runbook / Manual Operativo del Acompañante iOS

**Date:** 11 October 2026  
**Target Hardware:** Apple iPhone 15 Pro (8 GB Unified Memory, A17 Pro)  
**Target OS:** iOS 17.0+  
**Architecture:** WKWebView native shell embedding the React 19 PWA (`https://jouhayerk-cloud.github.io/onyx.mx/`) with local on-device inference via Google EmbeddingGemma 2 (740M text+image+audio `.litertlm`, ~485 MB) powered by the official LiteRT-LM Swift package (`LiteRTLM` XCFramework v0.18.0).  
**Host Station:** Windows 11 (No physical Mac; unsigned IPA compiled in GitHub Actions CI, signed locally with Free Apple ID).

---

# Part 1: English Runbook

## 1. System Overview & Architecture

The Onyx.mx iOS Companion encapsulates our production warehouse web app inside a native WebKit shell (`WKWebView`) to deliver instant, zero-cloud-cost multimodal vector embeddings directly on the warehouse floor.

### Web-to-Native IPC Bridge Contract
The PWA communicates with the native Swift layer via `window.webkit.messageHandlers.onyxEmbed.postMessage(msg)` using iOS 14+ `WKScriptMessageHandlerWithReply`, returning a native JavaScript `Promise`.

All payloads and responses adhere to JSON dictionaries:

1. **System & Model Info (`op: "info"`):**
   - **Request:** `{ "op": "info" }`
   - **Response:** `{ "model": "google/embeddinggemma-2-740m", "dims": 256, "version": "0.18.0", "modalities": ["text", "image", "audio"] }`

2. **Text Batch Embedding (`op: "embed"`):**
   - **Request:** `{ "op": "embed", "kind": "query" | "document", "texts": ["task: search result | query: jarrón"] }`
   - **Note:** Texts arrive from TypeScript pre-formatted with official Google EmbeddingGemma 2 task instruction prefixes.
   - **Response:** `{ "vectors": [[0.0123, -0.0456, ...]] }` (Array of normalized `[Double]` vectors).

3. **Image Embedding (`op: "embed_image"`):**
   - **Request:** `{ "op": "embed_image", "base64": "<base64_data>", "mimeType": "image/jpeg" }`
   - **Response:** `{ "vector": [0.0341, -0.0112, ...] }` (Single normalized `[Double]` vector).

4. **Audio Embedding (`op: "embed_audio"`):**
   - **Request:** `{ "op": "embed_audio", "base64": "<base64_data>", "mimeType": "audio/wav" }`
   - **Response:** `{ "vector": [0.0102, 0.0551, ...] }` (Single normalized `[Double]` vector).

5. **Error Handling:**
   - Any native failure (file missing, OOM, unsupported mime type) rejects the Promise with a readable Error message.

### Model Weight Lookup Priority
On initialization, the LiteRT-LM engine searches for model files (`*.litertlm`) in strict priority order:
1. **`Documents/Models/*.litertlm`** (Transferred over USB via Apple Devices / iTunes file sharing; persists across weekly re-signs).
2. **App Bundle** (Packaged inside `OnyxCompanion.app` if pre-baked in CI).
3. **Remote Download** (Fallback background download if missing locally).

---

## 2. One-Time Setup Checklist

Complete these steps once per Windows 11 workstation and target iPhone 15 Pro:

- [ ] **1. Apple Account:** A valid Free Apple ID (Personal Team). No $99/year developer membership required.
- [ ] **2. Windows 11 USB Drivers:**
  - Install the standalone 64-bit installer for Apple iTunes (non-Microsoft Store version recommended for raw Anisette libraries) or the **Apple Devices** app from the Microsoft Store.
  - Verify Windows detects the iPhone when plugged in via USB-C.
- [ ] **3. Sideloading Utility:**
  - Download and install **Sideloadly** (v0.50+ on Windows 11) or **AltServer**.
  - Ensure Sideloadly's Anisette authentication is set to "Local" (or "Remote" if local Apple DLLs fail).
- [ ] **4. CLI Tooling on Windows 11:**
  - Python 3.11+ installed and present in PATH (`python --version`).
  - Install `pymobiledevice3`:
    ```powershell
    pip install -U pymobiledevice3
    ```
- [ ] **5. Enable Developer Mode on iPhone 15 Pro (iOS 17+):**
  - Plug iPhone into Windows PC over USB. Tap **Trust This Computer** on the phone and enter your device passcode.
  - On the iPhone: Open **Settings** → **Privacy & Security** → scroll to **Developer Mode**.
  - Toggle Developer Mode to **On**.
  - Tap **Restart** when prompted.
  - After device reboots, unlock the screen and tap **Turn On** on the system confirmation dialog. Enter passcode.
- [ ] **6. Initial Trust of Personal Certificate on iPhone:**
  - After first installing the companion app with Sideloadly:
  - On the iPhone: Open **Settings** → **General** → **VPN & Device Management**.
  - Under *Developer App*, tap your Apple ID email address.
  - Tap **Trust "[your-email@domain.com]"**, then confirm **Trust**.

---

## 3. How to Inspect and Download the CI Build

Because no physical Mac is available, compilation occurs on GitHub Actions macOS runners:

1. **Navigate to GitHub:** Open the repository on GitHub (`jouhayerk-cloud/LN-OPS` or main repo).
2. **Access Actions:** Click the **Actions** tab at the top.
3. **Locate Workflow:** In the left sidebar, click **iOS Companion App Build**.
4. **Trigger Build (if manual):**
   - Click **Run workflow** dropdown on `main` branch.
   - Alternatively, any push touching `ios/OnyxCompanion/**` triggers the workflow automatically.
5. **Download Artifact:**
   - Click the completed run (green checkmark, typically builds in ~3–5 minutes).
   - Scroll to the **Artifacts** section at the bottom.
   - Click **OnyxCompanion-unsigned-ipa** to download the archive `.zip`.
   - Extract the `.zip` to obtain `OnyxCompanion.ipa` on your Windows 11 PC (e.g. into `C:\dist\OnyxCompanion.ipa`).

---

## 4. How to Copy the 485 MB Model Once

The EmbeddingGemma 2 740M model file (`~485 MB .litertlm`) needs to be transferred to the iPhone only **once**. It resides in the app's sandboxed `Documents/Models` container, which iOS preserves even when the binary is re-installed during weekly re-signing.

### Recommended Method: Apple Devices App (or iTunes) on Windows 11
1. Connect the iPhone 15 Pro via USB to your Windows 11 PC.
2. Launch the **Apple Devices** app (or legacy iTunes).
3. Select your iPhone in the sidebar.
4. Click the **Files** (or **File Sharing**) tab.
5. In the list of apps supporting Document Sharing, select **OnyxCompanion**.
6. Drag and drop `embeddinggemma-2-740m.litertlm` (or your `.litertlm` file) into the file list window.
   *(Note: If the app expects `Documents/Models/`, create a folder named `Models` or place the file directly in Documents as the app inspects both locations).*
7. Click **Sync** / **Apply**.
8. Disconnect or leave connected. The file remains permanently until the app is deleted.

> [!NOTE]
> *[UNVERIFIED]* Direct command-line transfer of files into third-party sandboxed app directories on non-jailbroken iOS 17+ devices via `pymobiledevice3 afc` or `house-arrest` is experimental and may fail due to strict iOS 17 AFC permissions. The Apple Devices / iTunes File Sharing GUI is the verified, reliable method.

---

## 5. The Weekly Routine (Step-by-Step, ~5–7 Minutes)

Free Apple IDs issue provisioning profiles that expire exactly **7 days** (168 hours) after generation. Follow this routine once a week:

| Step | Action | Expected Duration |
| :---: | :--- | :---: |
| **1** | Connect iPhone 15 Pro to Windows 11 workstation via USB-C cable. | 0.5 min |
| **2** | If a new build was merged, download the latest `OnyxCompanion.ipa` from GitHub Actions. Otherwise, reuse your local `.ipa`. | 1.0 min |
| **3** | Open **Sideloadly** on Windows 11: <br> • Verify your iPhone appears under *Target Device*. <br> • Verify your Free Apple ID is selected under *Apple ID*. <br> • Drag `OnyxCompanion.ipa` into the IPA icon box. <br> • Click **Start**. Sideloadly signs and installs the app over USB. | 2.5 min |
| **4** | Open PowerShell 5.1 and run the weekly refresh tracker: <br> `powershell -ExecutionPolicy Bypass -File .\scripts\ios\weekly-refresh.ps1 -IpaPath "C:\dist\OnyxCompanion.ipa"` <br> This updates `%LOCALAPPDATA%\OnyxCompanion\last-install.json` and resets the 7-day clock. | 0.5 min |
| **5** | Launch **OnyxCompanion** on the iPhone: <br> • Verify the animated Onyx Chan face appears in the Onyx Island header. <br> • Test a Spanish search query (e.g. "jarrón de cerámica") to confirm local LiteRT-LM vector computation. | 1.0 min |
| **Total**| Complete Weekly Refresh | **~5.5 min** |

---

## 6. What to Do When the App Will Not Open (Profile Expired)

### Symptoms
- Tapping the OnyxCompanion icon on iOS produces:
  - *"Unable to Verify App: An internet connection is required to verify the trust of the developer..."* OR
  - *"OnyxCompanion is No Longer Available"*.
- The 7-day personal certificate has reached its expiration limit.

### Recovery Procedure
1. **DO NOT DELETE THE APP.** Deleting the app deletes the `Documents/Models/` directory, requiring you to re-copy the 485 MB model file.
2. Connect the phone to the Windows 11 PC via USB.
3. Open Sideloadly, load `OnyxCompanion.ipa`, and click **Start**.
4. Sideloadly overwrites the expired binary with an identical binary signed with a fresh 7-day certificate.
5. All app data, model weights, and offline cache remain intact.
6. Run `.\scripts\ios\weekly-refresh.ps1 -IpaPath "C:\dist\OnyxCompanion.ipa"` to reset your PC tracker.

---

## 7. Troubleshooting Table

| Symptom / Error | Root Cause | Exact Resolution |
| :--- | :--- | :--- |
| **"Developer Mode Disabled"** on app launch | Developer Mode was turned off or not confirmed after reboot. | Open iPhone **Settings** → **Privacy & Security** → **Developer Mode** → Toggle ON and reboot device. Tap **Turn On** after reboot. |
| **"Untrusted Developer"** error on iOS | The personal certificate from your Apple ID has not been explicitly trusted in iOS settings. | Go to **Settings** → **General** → **VPN & Device Management** → Tap your Apple ID email → Tap **Trust**. |
| **"Unable to Verify App"** after 7 days | The 7-day personal provisioning profile expired. | Re-sign the `.ipa` using Sideloadly over USB. Do NOT uninstall the app. |
| **Sideloadly: "Call to np_client_new failed"** | Apple Mobile Device service is hung or iTunes drivers are corrupted. | Restart `Apple Mobile Device Service` in `services.msc` on Windows 11, or reconnect the USB-C cable. |
| **`pymobiledevice3 usbmux list` returns empty** | iPhone is locked, screen is off, or "Trust This Computer" was not accepted. | Unlock the iPhone, ensure USB cable is connected directly, tap **Trust** when prompted on phone. |
| **Model inference throws "Model file not found"** | The `.litertlm` file is missing from `Documents/Models/` and bundle. | Connect to Apple Devices / iTunes on Windows, go to File Sharing → OnyxCompanion, and drag `embeddinggemma-2-740m.litertlm` into Documents. |
| **App crashes under jetsam memory pressure (Jetsam event)** | Peak allocator memory exceeded iOS ceiling during multimodal operations. | Ensure target device is iPhone 15 Pro (8 GB memory). Verify no heavy background apps are consuming RAM. |
| **`check-ios-ops.cjs` fails syntax check** | PowerShell 5.1 syntax error in `weekly-refresh.ps1` or missing tokens. | Run `node scripts/check-ios-ops.cjs` to verify AST and token assertions. |

---

## 8. Unverified Technical Claims

- **[UNVERIFIED]** *`pymobiledevice3` direct sandboxed AFC file transfer:* Whether a non-jailbroken device on iOS 17+ allows pushing 485 MB directly into `OnyxCompanion/Documents/Models` via `pymobiledevice3 afc` without user confirmation via the Apple Devices GUI.
- **[UNVERIFIED]** *LiteRT-LM Swift XCFramework v0.18.0 audio conformer memory footprint on iOS 17:* While text+vision 740M operates at ~485 MB, simultaneous initialization of the optional audio conformer may require additional headroom.
- **[UNVERIFIED]** *GitHub Actions `macos-15` runner label lifetime:* GitHub frequently updates macOS runner images; verify `macos-15` runner availability against the latest GitHub Actions runner virtual environments documentation.

---
---

# Parte 2: Manual Operativo en Español (México, Tuteo)

## 1. Resumen del Sistema y Arquitectura

El acompañante iOS de Onyx.mx empaqueta nuestra aplicación web de almacén (`https://jouhayerk-cloud.github.io/onyx.mx/`) dentro de un contenedor nativo WebKit (`WKWebView`). Ejecuta inferencia local sin conexión ni costo de API usando el modelo multimodal Google EmbeddingGemma 2 (740M texto+imagen+audio `.litertlm`, ~485 MB) mediante el paquete oficial LiteRT-LM para Swift (`LiteRTLM` XCFramework v0.18.0) en iOS 17+.

### Contrato de Mensajería Web a Nativo
La app web se comunica mediante `window.webkit.messageHandlers.onyxEmbed.postMessage(msg)` usando `WKScriptMessageHandlerWithReply`:
- `{ op: "info" }`: Devuelve información del modelo, dimensiones (256d), versión y modalidades activas.
- `{ op: "embed", kind: "query" | "document", texts: [...] }`: Genera vectores normalizados a partir de textos que ya incluyen los prefijos oficiales de instrucción de EmbeddingGemma 2.
- `{ op: "embed_image", base64: "...", mimeType: "image/jpeg" }`: Devuelve el vector de una imagen.
- `{ op: "embed_audio", base64: "...", mimeType: "audio/wav" }`: Devuelve el vector de un audio.
- Los errores nativos se devuelven como excepciones legibles en la promesa de JavaScript.

### Prioridad de Búsqueda del Modelo
1. `Documents/Models/*.litertlm` (Copiado por USB desde Windows; no se borra al refirmar la app).
2. Paquete interno de la app (Bundle).
3. Descarga remota si no existe localmente.

---

## 2. Checklist de Configuración Inicial (Por Única Vez)

Realiza estos pasos una sola vez en tu computadora con Windows 11 y tu iPhone 15 Pro:

- [ ] **1. Cuenta de Apple:** Cuenta gratuita de Apple ID (Personal Team). No necesitas pagar la membresía de $99 USD al año.
- [ ] **2. Controladores en Windows 11:**
  - Instala la versión de iTunes directo de la página de Apple (o la aplicación **Dispositivos Apple** de la Microsoft Store).
  - Comprueba que Windows detecte tu iPhone por cable USB-C.
- [ ] **3. Programa de Carga Lateral (Sideloading):**
  - Descarga e instala **Sideloadly** en Windows 11.
  - Asegúrate de que la autenticación Anisette esté configurada en "Local".
- [ ] **4. Herramientas de Consola:**
  - Verifica que tengas Python 3 instalado en Windows (`python --version`).
  - Instala la herramienta de comunicación USB:
    ```powershell
    pip install -U pymobiledevice3
    ```
- [ ] **5. Activa el Modo de Desarrollador en tu iPhone 15 Pro (iOS 17+):**
  - Conecta el iPhone a la computadora por USB. Toca **Confiar en esta computadora** en la pantalla del teléfono e introduce tu código.
  - En tu iPhone, entra a **Configuración** → **Privacidad y seguridad** → baja hasta **Modo de desarrollador**.
  - Activa la casilla de **Modo de desarrollador**.
  - El iPhone te pedirá reiniciar: presiona **Reiniciar**.
  - Al encender, desbloquea la pantalla y en el diálogo del sistema toca **Activar**, luego introduce tu código de bloqueo.
- [ ] **6. Confiar en tu Certificado Personal en el iPhone:**
  - Tras instalar la app por primera vez con Sideloadly:
  - En tu iPhone, ve a **Configuración** → **General** → **Administración de dispositivos y VPN**.
  - En *App de desarrollador*, toca tu correo de Apple ID.
  - Toca **Confiar en "[tu-correo@dominio.com]"** y confirma la acción.

---

## 3. Cómo Revisar y Descargar la Compilación de GitHub Actions

Como no usamos una Mac física, la compilación se realiza automáticamente en los servidores de GitHub Actions con macOS:

1. Entra al repositorio en GitHub.
2. Haz clic en la pestaña superior **Actions**.
3. En la barra izquierda, selecciona el flujo **iOS Companion App Build**.
4. Si quieres compilar manualmente, haz clic en **Run workflow**. (Cualquier cambio empujado a `ios/OnyxCompanion/**` compila de forma automática).
5. Al terminar la compilación (ícono verde, toma ~3 a 5 minutos), haz clic en el registro.
6. Baja a la sección **Artifacts** y descarga **OnyxCompanion-unsigned-ipa**.
7. Descomprime el archivo `.zip` en tu PC de Windows (por ejemplo en `C:\dist\OnyxCompanion.ipa`).

---

## 4. Cómo Copiar el Modelo de 485 MB por Única Vez

El modelo EmbeddingGemma 2 740M (`.litertlm` de ~485 MB) solo se transfiere al teléfono **una sola vez**. Se guarda en la carpeta de documentos de la app y se mantiene a salvo semana a semana sin borrarse cuando refirmas la aplicación.

### Método Oficial Recomendado: Aplicación Dispositivos Apple / iTunes
1. Conecta tu iPhone 15 Pro por USB a tu PC con Windows 11.
2. Abre la app **Dispositivos Apple** (o iTunes).
3. Selecciona tu teléfono en la barra lateral.
4. Entra a la sección **Archivos** (o **Compartir archivos**).
5. En la lista de aplicaciones, haz clic en **OnyxCompanion**.
6. Arrastra y suelta tu archivo `embeddinggemma-2-740m.litertlm` dentro del cuadro de documentos.
7. Haz clic en **Sincronizar** / **Aplicar**.
8. ¡Listo! La app detectará el modelo de inmediato cada vez que inicie.

> [!NOTE]
> *[UNVERIFIED]* La transferencia directa de archivos por línea de comandos mediante `pymobiledevice3 afc` a carpetas de apps en iOS 17 sin jailbreak no está verificada y suele ser bloqueada por los permisos de Apple. El arrastrar y soltar por la app Dispositivos Apple es el método 100% confiable.

---

## 5. Rutina Semanal Paso a Paso (Duración estimada: 5 a 7 Minutos)

Las cuentas gratuitas de Apple ID tienen perfiles que duran exactamente **7 días**. Una vez a la semana, sigue estos sencillos pasos:

1. **Conecta tu teléfono (0.5 min):** Conecta tu iPhone 15 Pro a tu PC de Windows 11 mediante el cable USB-C.
2. **Descarga o ubica el archivo IPA (1 min):** Si hubo cambios en el código, descarga el último `OnyxCompanion.ipa` de GitHub Actions. Si no hubo cambios, usa el que ya tienes guardado en tu PC.
3. **Refirma e instala con Sideloadly (2.5 min):**
   - Abre Sideloadly en Windows 11.
   - Verifica que aparezca tu iPhone en *Target Device* y tu Apple ID.
   - Arrastra el archivo `OnyxCompanion.ipa` a la ventana de Sideloadly.
   - Presiona **Start**. Sideloadly refirma el paquete con un nuevo perfil de 7 días y lo instala directamente en tu teléfono.
4. **Registra la fecha y verifica los días (0.5 min):**
   - Abre PowerShell y ejecuta el script de control:
     ```powershell
     powershell -ExecutionPolicy Bypass -File .\scripts\ios\weekly-refresh.ps1 -IpaPath "C:\dist\OnyxCompanion.ipa"
     ```
   - Esto guarda la fecha en `%LOCALAPPDATA%\OnyxCompanion\last-install.json` y te avisa cuántos días de vida le quedan a tu perfil.
5. **Prueba la app en tu teléfono (1 min):**
   - Abre **OnyxCompanion** en tu iPhone.
   - Confirma que aparezca la cara animada de Onyx Chan en el encabezado.
   - Realiza una búsqueda de prueba en español para verificar que el modelo local de LiteRT-LM responda al instante.

---

## 6. Qué Hacer Cuando la App No Abre (Perfil Expirado)

### Síntomas
- Al tocar el ícono de OnyxCompanion en tu iPhone aparece el mensaje:
  - *"No se puede verificar la app: Se requiere una conexión a internet para verificar..."* O
  - *"OnyxCompanion ya no está disponible"*.
- Esto significa que transcurrieron los 7 días de tu cuenta gratuita de Apple ID.

### Solución Inmediata
1. **NO BORRES LA APLICACIÓN DE TU IPHONE.** Si la borras, se eliminarán los 485 MB del modelo y tendrás que volver a copiarlos.
2. Conecta tu iPhone a tu PC por cable USB.
3. Abre Sideloadly, arrastra el archivo `OnyxCompanion.ipa` y presiona **Start**.
4. Sideloadly reemplazará el ejecutable expirado conservando todos los datos, el modelo de 485 MB y la memoria de la aplicación intactos.
5. Ejecuta `.\scripts\ios\weekly-refresh.ps1 -IpaPath "C:\dist\OnyxCompanion.ipa"` para reiniciar tu contador semanal.

---

## 7. Tabla de Solución de Problemas

| Problema / Error | Causa Raíz | Solución |
| :--- | :--- | :--- |
| **"Modo de desarrollador desactivado"** al abrir la app | No activaste el modo de desarrollador o faltó confirmarlo tras reiniciar el iPhone. | Ve a **Configuración** → **Privacidad y seguridad** → **Modo de desarrollador** → Actívalo y reinicia tu iPhone. Toca **Activar** al encender. |
| **"Desarrollador no confiable"** en iOS | No has autorizado tu cuenta personal en los ajustes del sistema de iOS. | Ve a **Configuración** → **General** → **Administración de dispositivos y VPN** → Toca tu correo → Presiona **Confiar**. |
| **"No se puede verificar la app"** tras 7 días | Tu perfil semanal de Apple ID expiró. | Refirma la app con Sideloadly por cable USB. Recuerda NO borrar la app del teléfono. |
| **Error en Sideloadly: "Call to np_client_new failed"** | El servicio de dispositivos Apple en Windows se quedó trabado. | Reinicia el servicio `Apple Mobile Device Service` en `services.msc` de Windows, o desconecta y vuelve a conectar el cable USB-C. |
| **`pymobiledevice3 usbmux list` no muestra dispositivos** | El teléfono está bloqueado o no aceptaste el diálogo de "Confiar en esta computadora". | Desbloquea la pantalla de tu iPhone y presiona **Confiar** cuando te pregunte. |
| **Error: "Model file not found" en la app** | El archivo `.litertlm` no está en la carpeta `Documents/Models` ni en la app. | Conecta tu iPhone a la app Dispositivos Apple en Windows, entra a Compartir archivos → OnyxCompanion y arrastra el modelo `.litertlm`. |
| **Cierre repentino de la app por memoria (Jetsam)** | La memoria del sistema superó el límite permitido por iOS. | Asegúrate de usar un iPhone 15 Pro (8 GB de RAM) y cierra aplicaciones pesadas en segundo plano. |
| **Falla en `check-ios-ops.cjs`** | Error de sintaxis en PowerShell o falta algún indicador en la documentación. | Ejecuta `node scripts/check-ios-ops.cjs` para verificar la consistencia de los archivos. |

---

## 8. Afirmaciones No Verificadas [UNVERIFIED]

- **[UNVERIFIED]** *Copia de archivos por CLI mediante `pymobiledevice3` AFC:* No está verificado que en iOS 17+ se puedan copiar 485 MB directamente a la carpeta de la app sin usar la interfaz de Dispositivos Apple de Windows.
- **[UNVERIFIED]** *Consumo de memoria de la torre de audio con LiteRT-LM v0.18.0:* El modelo de texto y visión funciona dentro de los 485 MB, pero el uso simultáneo de conformer de audio en iOS 17 requiere pruebas de estrés adicionales.
- **[UNVERIFIED]** *Disponibilidad de la etiqueta de ejecutor `macos-15` en GitHub Actions:* Las imágenes de macOS en GitHub Actions se actualizan periódicamente; comprueba la documentación oficial de GitHub si el nombre del ejecutor cambia con el tiempo.
