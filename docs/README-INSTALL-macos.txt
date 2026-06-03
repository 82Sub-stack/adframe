AdFrame internal macOS install

This is an internal unsigned build for Apple Silicon Macs.

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

The first-launch warning is expected for this internal unsigned build.
After the first approved launch, macOS usually allows normal launches from Applications.
