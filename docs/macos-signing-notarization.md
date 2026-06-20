# macOS Signing And Notarization

AdFrame keeps the existing unsigned internal package command and adds a separate signed release path.

## Requirements

- macOS build host with Xcode command line tools.
- Apple Developer Program membership.
- Developer ID Application certificate for direct distribution outside the Mac App Store.
- Notarization credentials for Apple's notary service.

Apple's Developer ID overview describes the certificate and notarization requirements:
https://developer.apple.com/support/developer-id/

Apple's current notarization workflow uses `notarytool` rather than the deprecated `altool` path:
https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution

Electron Builder's macOS config supports Developer ID signing and built-in notarization:
https://www.electron.build/docs/mac

## Local Setup

1. Install or export a Developer ID Application certificate.
   - Keychain option: install the certificate in the login keychain.
   - CI/local file option: export a `.p12` and set `CSC_LINK` plus `CSC_KEY_PASSWORD`.
2. Confirm the local keychain identity if using Keychain:

   ```sh
   security find-identity -v -p codesigning
   ```

3. Copy the local signing template:

   ```sh
   cp .env.signing.example .env.signing
   ```

4. Fill in one signing option:

   ```sh
   CSC_LINK=/absolute/path/to/developer-id-application.p12
   CSC_KEY_PASSWORD=certificate-export-password
   ```

   Or install the Developer ID certificate in Keychain instead.

5. Fill in one notarization option. Preferred API key option:

   ```sh
   APPLE_API_KEY=/absolute/path/to/AuthKey_KEYID.p8
   APPLE_API_KEY_ID=KEYID
   APPLE_API_ISSUER=ISSUER_UUID
   ```

   Apple ID app-specific password option:

   ```sh
   APPLE_ID=developer@example.com
   APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
   APPLE_TEAM_ID=TEAMID
   ```

   Keychain profile option:

   ```sh
   xcrun notarytool store-credentials adframe-notary --apple-id "developer@example.com" --team-id "TEAMID" --password "xxxx-xxxx-xxxx-xxxx"
   ```

   Then set:

   ```sh
   APPLE_KEYCHAIN_PROFILE=adframe-notary
   ```

## Build

Unsigned internal build:

```sh
npm run desktop:pack:mac
```

Signed and notarized build:

```sh
npm run desktop:pack:mac:signed
```

The signed command fails early if signing material or notarization credentials are missing. It also forces real code signing so Electron Builder does not silently fall back to an ad-hoc signature.

## Verify

```sh
npm run desktop:verify:mac
```

The verification script checks:

- `codesign --verify --deep --strict`
- `codesign -dv --verbose=4`
- `spctl --assess --type execute`
- `xcrun stapler validate`

Use `ADFRAME_MAC_APP_PATH=/path/to/AdFrame.app npm run desktop:verify:mac` to verify a non-default app path.
