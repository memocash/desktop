# Memo Desktop

Memo is a native desktop Bitcoin Cash wallet and social client for Linux,
macOS, and Windows. Downloads are published at
[memocash.github.io/desktop](https://memocash.github.io/desktop/).

### Checkout repo
```bash
git clone git@github.com:memocash/desktop.git
cd desktop
```

### Install dependencies
```bash
npm ci
npm run rebuild
```

### Run app
```bash
npm start
```

## Build installers locally

Build on the operating system you are targeting. The output is written to
`dist/`.

```bash
npm run dist:linux # AppImage and .deb
npm run dist:mac   # .dmg and .zip
npm run dist:win   # NSIS installer
```

macOS generally cannot produce Windows installers, and Linux cannot produce
macOS installers, so the repository includes a GitHub Actions matrix that runs
each build on its native hosted runner.

## Publish a release

1. Update `version` in `package.json` and `package-lock.json` (for example,
   `npm version 0.0.3 --no-git-tag-version`) and commit the change.
2. Create and push a matching version tag:

   ```bash
   git tag v0.0.3
   git push origin master v0.0.3
   ```

The `Build and publish release` workflow builds Linux x64, macOS x64 and arm64,
and Windows x64 artifacts. It then creates a GitHub Release and attaches every
installer. The landing page reads the latest release from GitHub and displays
direct download links automatically.

The default workflow produces **unsigned** binaries. Users will see operating
system security warnings until code signing is configured. For public
distribution, add an Apple Developer ID certificate and notarization settings
for macOS, and a code-signing certificate for Windows, following the
[electron-builder signing documentation](https://www.electron.build/code-signing).
