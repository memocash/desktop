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
