import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerFlatpak } from '@electron-forge/maker-flatpak';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: 'assets/icons/icon',
    executableName: 'polyphon',
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      authors: 'Polyphon AI',
      setupIcon: 'assets/icons/icon.ico',
      setupExe: process.env.BUILD_ARCH ? `Polyphon-${process.env.npm_package_version}-${process.env.BUILD_ARCH}-Setup.exe` : 'Polyphon-Setup.exe',
    }),
    new MakerDMG({}, ['darwin']),
    new MakerDeb({
      options: {
        maintainer: 'Polyphon AI',
        homepage: 'https://polyphon.ai',
        icon: 'assets/icons/icon.png',
      },
    }, ['linux']),
    new MakerRpm({
      options: {
        license: 'Proprietary',
        homepage: 'https://polyphon.ai',
        icon: 'assets/icons/icon.png',
      },
    }, ['linux']),
    new MakerFlatpak({
      options: {
        id: 'ai.polyphon.Polyphon',
        runtime: 'org.freedesktop.Platform',
        runtimeVersion: '24.08',
        sdk: 'org.freedesktop.Sdk',
        base: 'org.electronjs.Electron2.BaseApp',
        baseVersion: '24.08',
        categories: ['Utility'],
        description: 'One chat. Many voices.',
        icon: 'assets/icons/icon.png',
        files: [],
        // Disable bwrap sandbox during build — required in VM/CI environments
        // where user namespaces are unavailable. Not in MakerFlatpakOptionsConfig
        // types but passed through to @malept/flatpak-bundler via the flat merge
        // in electron-installer-common (installer.js:217).
        ...(({ extraFlatpakBuilderArgs: ['--disable-sandbox'] }) as object),
      },
    }, ['linux']),
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
