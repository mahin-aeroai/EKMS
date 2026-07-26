const { getDefaultConfig } = require("expo/metro-config");

/**
 * SDK 52+ configures Metro for npm/yarn/pnpm workspaces automatically --
 * watchFolders, resolver.nodeModulesPaths and resolver.disableHierarchicalLookup
 * no longer need to be set by hand (see
 * https://docs.expo.dev/guides/monorepos/). The manual version of this file
 * set disableHierarchicalLookup itself, which also broke Metro's own internal
 * resolution of packages like `semver` that aren't inside the paths it was
 * told about; deleting it fixes that too.
 *
 * @mmdi/shared still resolves straight from TypeScript source (no build
 * step) because Expo's auto-detected watchFolders cover the monorepo root,
 * so packages/shared is visible and hot-reloads like app code.
 */

module.exports = getDefaultConfig(__dirname);
