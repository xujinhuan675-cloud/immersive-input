# macOS Release TODO

This note is for future macOS release debugging and publishing.

## Goal

- First install on macOS: ship `.dmg`
- In-app update on macOS: ship `.app.tar.gz`, `.app.tar.gz.sig`, and `latest.json`

## Current Status

As of `2026-04-27`, the macOS compile issue caused by `WindowBuilder::transparent(true)` has already been fixed in `4.0.12`.

The current blocker is no longer Rust compilation. The workflow now fails during macOS signing with:

```text
Signing with identity ""
Error failed to bundle project: failed to import keychain certificate
```

This means the macOS release path is currently blocked by Apple signing secrets, not by app code.

As of `2026-04-27`, the updater manifest flow has also been relaxed so Windows can still publish a valid `latest.json` even when macOS assets are missing. That keeps Windows in-app updates working while macOS signing is still unfinished.

## Required Secrets

These are used by `.github/workflows/package.yml` in the macOS build step:

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

## Most Likely Failure Causes

- `APPLE_SIGNING_IDENTITY` is empty
- `APPLE_CERTIFICATE` is missing or not valid base64
- `APPLE_CERTIFICATE_PASSWORD` does not match the uploaded certificate
- The certificate is not a valid Developer ID Application certificate
- Notarization-related secrets are missing when the workflow expects a fully signed macOS build

## Release Checklist

- [ ] Confirm the release is triggered by a tag push, not only `master`
- [ ] Confirm `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` use the same version
- [ ] Confirm updater secrets match the repo public key
- [ ] Confirm `APPLE_SIGNING_IDENTITY` is not empty in GitHub Secrets
- [ ] Confirm `APPLE_CERTIFICATE` is the correct `.p12` content in base64 form
- [ ] Confirm `APPLE_CERTIFICATE_PASSWORD` matches that `.p12`
- [ ] Push `master` and the release tag
- [ ] Wait for both macOS matrix jobs to pass:
  - `aarch64-apple-darwin`
  - `x86_64-apple-darwin`
- [ ] Confirm `release-manifest` runs after macOS and Windows builds succeed
- [ ] Confirm `latest.json` exists at:
  - `https://github.com/xujinhuan675-cloud/immersive-input/releases/latest/download/latest.json`

## Debug Order

When macOS release fails, check in this order:

1. Open the tag workflow run in GitHub Actions.
2. Confirm you are looking at the tag run, not the `master` run.
3. Open one failed macOS job.
4. Search the `Build and package` step for these keywords:
   - `transparent`
   - `Signing with identity`
   - `failed to import keychain certificate`
   - `notarize`
5. If the error is `transparent`, check `src-tauri/src/window.rs`.
6. If the error is `failed to import keychain certificate`, check Apple signing secrets first.
7. If both macOS jobs succeed, verify `release-manifest` also succeeds.
8. If `release-manifest` fails, app updates will still be broken even if `.dmg` exists.

## Expected Outputs

Successful macOS release should upload:

- `flow-input_<version>_aarch64.dmg`
- `flow-input_<version>_aarch64.app.tar.gz`
- `flow-input_<version>_aarch64.app.tar.gz.sig`
- `flow-input_<version>_x64.dmg`
- `flow-input_<version>_x64.app.tar.gz`
- `flow-input_<version>_x64.app.tar.gz.sig`

## Fallback Option

If signed macOS release is not required yet, consider changing the workflow so it only enables Apple signing when the required `APPLE_*` secrets are present.

That would allow CI to keep producing unsigned macOS artifacts for internal testing instead of failing during keychain import.
