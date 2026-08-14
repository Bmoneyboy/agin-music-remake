// Expo reads app.json first and passes it here as `config`. This file only
// overrides the identity fields, so app.json can keep tracking upstream without
// merge conflicts every time you pull.
//
// Set these in .env.local, in your shell, or as EAS secrets:
//   IOS_BUNDLE_ID    e.g. com.bmoney.aginmusic
//   APPLE_TEAM_ID    your 10-character Apple Team ID (paid account only)
//   ANDROID_PACKAGE  e.g. com.bmoney.aginmusic
//
// Without them the upstream identifiers are used, which will fail to sign
// under any account other than the original author's.

module.exports = ({ config }) => {
  const bundleId = process.env.IOS_BUNDLE_ID;
  const appleTeamId = process.env.APPLE_TEAM_ID;
  const androidPackage = process.env.ANDROID_PACKAGE;

  return {
    ...config,
    ios: {
      ...config.ios,
      ...(bundleId ? { bundleIdentifier: bundleId } : {}),
      // Drop the upstream team rather than inherit it: a stale appleTeamId
      // makes signing fail with a confusing "no matching profiles" error.
      ...(appleTeamId ? { appleTeamId } : { appleTeamId: undefined }),
    },
    android: {
      ...config.android,
      ...(androidPackage ? { package: androidPackage } : {}),
    },
  };
};
