# iOS unsigned Native RC

> updated 2026-08-17 · 0.1.0 build 1

## Purpose

Living Plot keeps a reproducible native iOS packaging gate even when Apple signing credentials are intentionally unavailable. The GitHub Actions `ios-unsigned-ipa` job runs on macOS, generates the native Expo iOS project, installs CocoaPods, builds the Release `iphoneos` application with Xcode code signing disabled, verifies that the resulting `.app` is not signed, and packages the bundle as an IPA-shaped ZIP.

This artifact proves that the native iOS project compiles and packages for device architecture. It is not an App Store, TestFlight, Ad Hoc, Development, or Personal Team distribution build.

## Native identity

- App name: `Living Plot`
- Bundle identifier: `com.oak.livingplot`
- Marketing version: `0.1.0`
- Build number: `1`

The values are declared in `apps/mobile/app.json` so Expo prebuild recreates the same native identity on every clean CI run.

## Build pipeline

The `ios-unsigned-ipa` job performs:

1. Node 24 clean install.
2. Xcode toolchain disclosure through `xcodebuild -version`.
3. `expo prebuild --platform ios --clean --no-install`.
4. `pod install` in the generated `apps/mobile/ios` project.
5. Release `iphoneos` build from `LivingPlot.xcworkspace` / `LivingPlot` scheme with `CODE_SIGNING_ALLOWED=NO`, `CODE_SIGNING_REQUIRED=NO`, empty code identity, and empty development team.
6. Metadata checks against the generated `Info.plist`.
7. `codesign` negative verification: the app container must report that it is not signed.
8. Packaging as `Payload/LivingPlot.app` inside `LivingPlot-unsigned.ipa`.
9. IPA structure inspection and artifact upload.

## Artifact semantics

Artifact name: `living-plot-ios-unsigned-ipa`.

An unsigned IPA is a build/packaging artifact only. A stock iPhone will reject it because there is no valid Apple signature/provisioning profile. Do not represent it as a directly installable beta.

Later signing can reuse the same native project/build identity with one of these separate paths:

- Personal Team device build from Xcode for the owner's registered local device;
- Apple Developer Program Development/Ad Hoc distribution;
- TestFlight/App Store distribution.

Those paths are deliberately outside this unsigned RC gate.

## Release gate

The iOS unsigned RC is complete only when the same Git SHA has:

- `quality` green on Node 24;
- `ios-static` green;
- `ios-unsigned-ipa` green with the IPA artifact uploaded;
- `android-apk` green so the native RC does not regress Android;
- clean and synchronized `main` after the candidate commit.
