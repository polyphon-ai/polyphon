import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: 'assets/icons/icon',
    executableName: 'polyphon',
    appBundleId: 'ai.polyphon.app',
    appCategoryType: 'public.app-category.productivity',
    darwinDarkModeSupport: true,
    // Uncomment and configure when you have an Apple Developer account:
    // osxSign: {
    //   identity: 'Developer ID Application: Your Name (TEAMID)',
    // },
    // osxNotarize: {
    //   tool: 'notarytool',
    //   appleId: process.env.APPLE_ID,
    //   appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    //   teamId: process.env.APPLE_TEAM_ID,
    // },
  },
  rebuildConfig: {},
  makers: [
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
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
