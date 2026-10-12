# Onyx Companion (iOS)

Onyx Companion is a native iOS companion app that wraps the Onyx.mx React PWA (`https://jouhayerk-cloud.github.io/onyx.mx/`) inside a `WKWebView` and executes Google EmbeddingGemma 2 locally on-device using the official Google LiteRT-LM Swift package (`v0.18.0`).

## Architecture & Communication

- **Web Container**: Loads the Onyx.mx PWA in a `WKWebView` configured with persistent storage (`websiteDataStore = .default()`).
- **Native Bridge**: Registers `window.webkit.messageHandlers.onyxEmbed.postMessage(msg)` conforming to `WKScriptMessageHandlerWithReply`.
- **Inference Runtime**: Manages a background `EmbeddingEngine` via an isolated Swift `actor` (`EmbeddingWorker`) ensuring non-blocking, serialised embeddings.
- **Model Discovery**: Looks up `.litertlm` models in `Documents/Models/` (iTunes/Finder file sharing, USB sideload), then `Bundle.main`, before falling back to download.

## Windows Development & Sideloading

- **Cannot be compiled on Windows**: iOS applications using Swift Package Manager with prebuilt binary xcframeworks (`CLiteRTLM.xcframework`) require Xcode and the Apple build toolchain available only on macOS.
- **Workflow**:
  1. Built on a GitHub Actions macOS runner as an **unsigned `.ipa`** archive.
  2. Downloaded onto a Windows PC.
  3. Sideloaded onto an iPhone (e.g., iPhone 15 Pro, iOS 17+) over USB using **Sideloadly** or **AltStore** with a free Apple ID (re-signed weekly).
  4. The preferred 740M text+image+audio `.litertlm` model file (~485 MB) is copied over USB into the app's `Documents/Models/` folder via iTunes File Sharing or the Apple Devices app.

## Building on CI (macOS Runner)

On a GitHub Actions macOS runner (e.g., `macos-14` with Xcode 15+):

```bash
# 1. Install XcodeGen
brew install xcodegen

# 2. Generate the Xcode project from project.yml
cd ios/OnyxCompanion
xcodegen generate

# 3. Build and archive without signing
xcodebuild archive \
  -project OnyxCompanion.xcodeproj \
  -scheme OnyxCompanion \
  -archivePath OnyxCompanion.xcarchive \
  -destination "generic/platform=iOS" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGNING_REQUIRED=NO

# 4. Package into unsigned .ipa for sideloading
mkdir -p build/Payload
cp -R OnyxCompanion.xcarchive/Products/Applications/OnyxCompanion.app build/Payload/
cd build
zip -r ../OnyxCompanion-unsigned.ipa Payload
```

## First CI Run Verification Checklist

On the first GitHub Actions CI run, verify the following:

1. **XcodeGen project generation**: Confirm `xcodegen generate` succeeds and generates `OnyxCompanion.xcodeproj` targeting iOS 17.0 and iPhone family.
2. **LiteRT-LM Package Resolution**: Ensure Swift Package Manager fetches `https://github.com/google-ai-edge/LiteRT-LM` at version `0.18.0` and downloads `CLiteRTLM.xcframework.zip` (checksum: `d765b99592d4ec3d0c9e2bd69469454af06c834861340672da1891c0c121c347`).
3. **Swift 5.9 / iOS 17 Compilation**: Confirm `EmbeddingEngine`, `EmbeddingEngineConfig`, and `OnyxEmbedBridge` compile cleanly with no missing symbols or linker errors.
4. **Code Signing Suppression**: Ensure `CODE_SIGNING_ALLOWED=NO` and `CODE_SIGNING_REQUIRED=NO` prevent errors related to missing provisioning profiles or signing certificates.
5. **Artifact Upload**: Confirm `OnyxCompanion-unsigned.ipa` is uploaded to workflow artifacts for Sideloadly/AltStore sideloading.
