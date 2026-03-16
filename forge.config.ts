import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerAppImage } from '@reforged/maker-appimage';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { renameSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: 'assets/icons/icon',
    executableName: 'polyphon',
    // On Linux, rename the electron binary and replace it with a wrapper shell
    // script that passes --no-sandbox. The SUID sandbox check in chrome's zygote
    // fires before JS runs, so app.commandLine.appendSwitch is too late to stop it.
    afterComplete: [
      (buildPath, electronVersion, platform, arch, done) => {
        if (platform !== 'linux') return done();
        try {
          const bin = join(buildPath, 'polyphon');
          const real = join(buildPath, 'polyphon.bin');
          renameSync(bin, real);
          writeFileSync(bin, '#!/bin/sh\nexec "$APPDIR/usr/lib/polyphon/polyphon.bin" --no-sandbox "$@"\n');
          chmodSync(bin, 0o755);
          done();
        } catch (err) {
          done(err as Error);
        }
      },
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      authors: 'Polyphon AI',
      setupIcon: 'assets/icons/icon.ico',
      setupExe: process.env.BUILD_ARCH ? `Polyphon-${process.env.npm_package_version}-${process.env.BUILD_ARCH}-Setup.exe` : 'Polyphon-Setup.exe',
    }),
    new MakerDMG({}, ['darwin']),
    new MakerAppImage({}),
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
