# macOS Build And Test Checklist

## Build Output

- Host requirement: macOS machine or macOS CI runner.
- Windows host cannot produce a runnable `.app` locally for this Tauri project.
- Current target strategy:
  - `aarch64-apple-darwin` for Apple Silicon
  - `x86_64-apple-darwin` for Intel Macs
- Expected artifacts:
  - `.dmg`
  - `.app.tar.gz` updater bundle

## Build Commands

### Local macOS

```bash
pnpm install
pnpm build
pnpm tauri build --target aarch64-apple-darwin
pnpm tauri build --target x86_64-apple-darwin
```

### CI

- Use a macOS runner.
- Required signing/notarization secrets if shipping signed builds:
  - `TAURI_PRIVATE_KEY`
  - `TAURI_KEY_PASSWORD`
  - `APPLE_SIGNING_IDENTITY`
  - `APPLE_CERTIFICATE`
  - `APPLE_CERTIFICATE_PASSWORD`
  - `APPLE_TEAM_ID`
  - `APPLE_API_ISSUER`
  - `APPLE_API_KEY`
  - `APPLE_ID`
  - `APPLE_PASSWORD`

## Preflight

- [ ] macOS version recorded
- [ ] CPU architecture recorded: Apple Silicon or Intel
- [ ] Fresh install path confirmed
- [ ] Existing old config backed up if regression test is needed
- [ ] Network available
- [ ] Accessibility permission can be granted
- [ ] App launches outside the development environment

## Install And Launch

- [ ] `.dmg` opens normally
- [ ] App can be dragged into `Applications`
- [ ] First launch succeeds
- [ ] No immediate crash on startup
- [ ] Tray icon appears
- [ ] Config window opens on first launch
- [ ] App icon, title, and product name display as `Flow Input`

## Permission Flow

- [ ] Accessibility permission prompt appears when needed
- [ ] Granting accessibility permission removes core interaction failures
- [ ] Relaunch after permission grant still works
- [ ] If permission is denied, app shows a recoverable behavior instead of hard failing

## Authentication

- [ ] Login window opens
- [ ] Email/password login succeeds
- [ ] Remembered login survives app restart
- [ ] Logout clears session as expected
- [ ] Re-login after logout succeeds

## Settings And About

- [ ] Left sidebar contains a dedicated `About` entry
- [ ] `About` page opens correctly
- [ ] `Check Update` action opens updater window
- [ ] `View Log` opens app log directory
- [ ] `View Config` opens config directory
- [ ] General settings page no longer contains duplicated About modal entry

## Translation

- [ ] Main translate window opens
- [ ] Source text can be entered manually
- [ ] Default visible translation services render correctly
- [ ] Google translation succeeds
- [ ] Bing translation succeeds
- [ ] DeepL free mode can be saved without forced validation
- [ ] DeepL free mode can translate at least one short sentence
- [ ] OpenAI translation works when API key is configured
- [ ] Changing source/target language works
- [ ] Dynamic translation does not freeze the UI

## OCR

- [ ] OCR window opens
- [ ] Default visible OCR services are all present in the selector
- [ ] System OCR works on macOS
- [ ] Rapid OCR works on macOS
- [ ] Qwen OCR works when configured
- [ ] Baimiao OCR works when configured
- [ ] OCR result can be copied
- [ ] OCR to translation flow works

## Hotkeys And Input Flows

- [ ] Selection translate hotkey works
- [ ] OCR recognize hotkey works
- [ ] OCR translate hotkey works
- [ ] Double-tap triggers behave as expected
- [ ] Input AI handle appears in editable contexts if enabled
- [ ] Paste/fill behavior still works after translation

## Tray And Window Behavior

- [ ] Tray menu actions work
- [ ] Tray click behavior matches configured action
- [ ] Pin/unpin behavior works in translate window
- [ ] Blur-to-close behavior works where expected
- [ ] Window size persistence works after reopen

## Update And Logging

- [ ] Updater window opens
- [ ] Update check can complete without crash
- [ ] Logs are written to the macOS app log directory
- [ ] No repeated fatal errors in log after basic smoke test

## Regression Notes

- [ ] No obvious Windows-only assumptions break the macOS UI
- [ ] OCR binaries under `src-tauri/resources/ocr-*-apple-darwin` execute correctly
- [ ] Rapid OCR binary resolves correctly on the target architecture
- [ ] Branding is consistent across app window, tray, and About page

## Test Record Template

- Build target:
- macOS version:
- Device architecture:
- Signed/notarized:
- Result:
- Blocking issues:
- Non-blocking issues:
