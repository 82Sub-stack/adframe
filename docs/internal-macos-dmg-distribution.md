# Internal macOS DMG Distribution

This is the no-Apple-credentials distribution path for AdFrame. It uses the existing unsigned DMG build and is intended for controlled internal testing or small-team distribution.

## Scope

- No Apple Developer account required.
- No Developer ID certificate required.
- No notarization credentials required.
- macOS Gatekeeper will warn on first launch because the app is unsigned and not notarized.
- Current validated macOS artifact is Apple Silicon: `AdFrame-1.0.0-arm64.dmg`.

Use the signed/notarized path later if the app needs lower-friction distribution to a wider audience.

## Build Checklist

Run from the repository root on a macOS Apple Silicon build machine:

```sh
git switch main
git pull --ff-only
npm install
npm run desktop:pack:mac
```

The DMG is written to:

```text
release/AdFrame-1.0.0-arm64.dmg
```

The zip and blockmap files are build outputs too, but distribute the DMG to users:

```text
release/AdFrame-1.0.0-arm64-mac.zip
release/AdFrame-1.0.0-arm64.dmg.blockmap
release/AdFrame-1.0.0-arm64-mac.zip.blockmap
```

Do not distribute the `release/mac-arm64/AdFrame.app` folder directly.

## Publisher Smoke Test

Before sharing the DMG, test the packaged app locally:

```sh
open release/mac-arm64/AdFrame.app
```

Confirm:

- The app window opens.
- Settings opens from the sidebar.
- The diagnostics show desktop mode.
- Website suggestions return ranked results.
- A generated mockup writes to the configured output folder.
- Quitting the app also stops the local server.

## Integrity Check

Generate a SHA-256 checksum after each build:

```sh
shasum -a 256 release/AdFrame-1.0.0-arm64.dmg
```

Share the checksum next to the DMG so recipients can verify the file did not change during transfer:

```sh
shasum -a 256 ~/Downloads/AdFrame-1.0.0-arm64.dmg
```

## Internal Sharing

Recommended channels:

- Company-managed file share.
- SharePoint, Google Drive, Dropbox Business, or equivalent restricted workspace folder.
- MDM/software catalog if available.

Avoid public links. Set access to named internal users or an internal group.

Recommended release folder contents:

```text
AdFrame-1.0.0-arm64.dmg
AdFrame-1.0.0-arm64.sha256.txt
README-INSTALL.txt
```

## Recipient Install Instructions

Send this to internal macOS users:

```text
AdFrame internal macOS install

1. Download AdFrame-1.0.0-arm64.dmg.
2. Optional: verify the checksum with Terminal:
   shasum -a 256 ~/Downloads/AdFrame-1.0.0-arm64.dmg
3. Double-click the DMG.
4. Drag AdFrame into Applications.
5. Eject the DMG.
6. Open Applications.
7. Control-click AdFrame, choose Open, then choose Open again if macOS asks.
8. If macOS blocks the app:
   - Open System Settings.
   - Go to Privacy & Security.
   - Find the AdFrame security message.
   - Choose Open Anyway.
   - Confirm Open.
9. In AdFrame, open Settings.
10. Add the Gemini API key if website suggestions are needed.
11. Choose an output folder for generated mockups.
```

The first-launch warning is expected for this internal unsigned build. After the first approved launch, macOS usually allows normal launches from Applications.

## Support Notes

Common first-launch messages vary by macOS version. Users may see wording such as:

- Apple cannot check it for malicious software.
- The developer cannot be verified.
- The app was downloaded from the internet.

Expected resolution is the same: use Control-click > Open or approve the app in System Settings > Privacy & Security.

If the app opens but suggestions fail:

- Confirm the Mac has internet access.
- Open Settings and confirm the Gemini API key is configured if AI suggestions are required.
- Try a fallback country/topic combination such as `United Kingdom` and `tech`.

If generated files are missing:

- Open Settings.
- Confirm the output folder exists and is writable.
- Choose a new output folder if needed.

## Version Updates

For each internal release:

1. Update the app version in `package.json` if this is a new user-facing build.
2. Run `npm run desktop:pack:mac`.
3. Smoke test the packaged app.
4. Generate a new SHA-256 checksum.
5. Upload the new DMG and checksum.
6. Tell users to quit AdFrame, replace the app in Applications, and launch the new version.

Manual updates are expected for this v1 internal distribution path.
