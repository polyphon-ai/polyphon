import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      // Unpack better-sqlite3 so its native .node binary is not inside the ASAR
      // archive (native addons cannot be loaded from within an ASAR).
      unpack: '**/node_modules/better-sqlite3/**',
    },
    icon: 'assets/icons/icon',
    extraResource: ['app-update.yml'],
    appBundleId: 'ai.polyphon.app',
    appCategoryType: 'public.app-category.productivity',
    darwinDarkModeSupport: true,
    // Signing and notarization — active when APPLE_SIGNING_IDENTITY is set (CI only).
    // Local builds remain unsigned. Never use safeStorage: it requires a persistent
    // signed keychain entry and breaks when the signing identity changes.
    ...(process.env.APPLE_SIGNING_IDENTITY && {
      osxSign: {
        identity: process.env.APPLE_SIGNING_IDENTITY,
        optionsForFile: (filePath: string) => ({
          entitlements: filePath.includes('Helper')
            ? 'entitlements.inherit.plist'
            : 'entitlements.plist',
        }),
      },
      osxNotarize: {
        appleId: process.env.APPLE_ID!,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD!,
        teamId: process.env.APPLE_TEAM_ID!,
      },
    }),
  },
  // Skip Forge's built-in native module rebuild. better-sqlite3 is built with
  // the SQLCipher amalgamation in the postinstall script (build-sqlcipher.mjs
  // --mode=electron) using electron-rebuild with the --sqlite3 extra arg.
  // Letting Forge rebuild it here would overwrite the SQLCipher binary with a
  // stock SQLite build.
  rebuildConfig: { onlyModules: [] },
  makers: [
    new MakerZIP({}, ['darwin']),
    new MakerDMG({
      icon: 'assets/icons/icon.icns',
      format: 'ULFO',
      additionalDMGOptions: {
        window: {
          position: { x: 400, y: 200 },
          size: { width: 540, height: 380 },
        },
      },
    }, ['darwin']),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/main/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
