# Building an installable IPA from Windows

You cannot compile an iOS binary on Windows. Apple's toolchain (clang for iOS,
the iOS SDK, `codesign`) ships only with Xcode and only runs on macOS. Every
route below works the same way: a macOS machine in the cloud compiles the app,
and your PC downloads the result.

---

## Path A - free, no Apple Developer account

Produces an **unsigned** IPA. You sign it yourself on your PC with your normal
Apple ID. App expires after **7 days** and must be refreshed.

### 1. Push this repo to your own GitHub account

```
git remote add origin https://github.com/Bmoneyboy/agin-music-mobile.git
git branch -M main
git add -A
git commit -m "Playback history, perf fixes, build config"
git push -u origin main
```

### 2. Set the bundle identifier

GitHub -> your repo -> **Settings -> Secrets and variables -> Actions ->
Variables -> New repository variable**

| Name | Value |
|---|---|
| `IOS_BUNDLE_ID` | `com.bmoney.aginmusic` |

Must differ from the upstream `rocks.agin.music`, or signing collides with the
original author's app.

### 3. Run the build

**Actions -> Build unsigned iOS IPA -> Run workflow.** Takes 20-40 minutes.
When it finishes, download the `AginMusic-unsigned-ipa` artifact and unzip it.

> **Minutes cost:** macOS runners bill at **10x**. A free account gets 2000
> minutes/month, so a *private* repo gives you ~200 macOS minutes - about 5
> builds. **Public repos are unlimited.** Keep it public, or use Codemagic
> (500 free macOS minutes/month, no 10x multiplier).

### 4. Sign and install on your PC

1. Install **iTunes from apple.com** - *not* the Microsoft Store version, which
   omits the USB drivers.
2. Install **AltStore** + **AltServer** from https://altstore.io
   (Prefer AltStore over Sideloadly: AltServer re-signs the app automatically
   every time your phone is on the same Wi-Fi, so it renews itself instead of
   dying every 7 days.)
3. Plug in the iPhone, open AltServer -> **Install AltStore** -> pick your device
   -> sign in with your Apple ID.
4. Open AltStore on the phone -> **My Apps -> +** -> select the `.ipa`.
5. On the phone: **Settings -> General -> VPN & Device Management** -> trust the
   developer certificate.

### Limits of free signing

| | |
|---|---|
| App lifetime | 7 days (AltServer auto-refreshes) |
| Apps installed | 3 at a time |
| App Groups | **Not available** - blocks WidgetKit widgets |
| CarPlay entitlement | **Not available** |
| Push notifications | Not available |

---

## Path B - $99/yr Apple Developer Program

Signed ad-hoc build, valid for a year, installs over the air. Your PC is barely
involved.

```
npm i -g eas-cli
eas login
eas device:create          # QR code -> install profile -> registers your UDID
set IOS_BUNDLE_ID=com.bmoney.aginmusic
set APPLE_TEAM_ID=YOURTEAMID
eas build --platform ios --profile preview
```

EAS returns a URL. Open it **in Safari on the iPhone** and it installs directly.
No cable, no AltStore.

This is the only path that unlocks App Groups (widgets), the CarPlay audio
entitlement, and builds that don't expire.

---

## Android

No signing theatre, no expiry, no Mac:

```
eas build --platform android --profile preview
```

Produces an APK you can install directly.

---

## Building locally if you ever get a Mac

```
npm install --legacy-peer-deps
npx expo prebuild --platform ios --clean
npx expo run:ios --configuration Release
```

## Verifying changes without any build

Catches roughly everything except native compile errors:

```
npx tsc --noEmit                      # type errors
npx expo export --platform ios        # bundles all JS; catches bad imports
```
