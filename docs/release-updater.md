# Release And Updater Flow

This project is configured so installed apps can update through the built-in `Check Update` flow.

## Required Secrets

The updater bundle must be signed with the same private key that matches the public key in:

- `src-tauri/tauri.conf.json`
- `src-tauri/webview.x64.json`
- `src-tauri/webview.x86.json`
- `src-tauri/webview.arm64.json`

Configure these GitHub Actions secrets before publishing releases:

- `TAURI_PRIVATE_KEY`
- `TAURI_KEY_PASSWORD`

Without them, the desktop installer can still be built, but `latest.json` cannot point to a valid signed updater package.

## Windows Release Output

The GitHub workflow now publishes these Windows x64 assets:

- `flow-input_<version>_x64.msi`
- `flow-input_<version>_x64.msi.zip`
- `flow-input_<version>_x64.msi.zip.sig`

The `.msi` is for first-time/manual installation.
The `.msi.zip` plus `.sig` are what Tauri updater downloads and verifies during in-app upgrades.

## Publish Steps

1. Bump the app version before release.
   Recommended: `pnpm version:bump:patch`
   Optional: `pnpm version:bump:minor` or `pnpm version:bump:major`
2. Push the release tag.
3. Let `.github/workflows/package.yml` build and upload the release assets.
4. The workflow then generates and uploads `latest.json`.

After that, older installed builds can use `About -> Check Update` or the background auto-update path.

## Local Build Notes

Local Windows desktop build without updater signing:

```powershell
pnpm tauri build -b msi --target x86_64-pc-windows-msvc
```

If you edited `package.json` manually and only want to resync the Rust/Tauri config versions:

```powershell
pnpm version:sync
```

Local Windows build including updater artifacts requires the signing secrets in the shell environment:

```powershell
$env:TAURI_PRIVATE_KEY="..."
$env:TAURI_KEY_PASSWORD="..."
pnpm tauri build -b msi updater --target x86_64-pc-windows-msvc
```
