# Third-party license notices

Upstream license texts for code and artwork copied into this repository,
kept verbatim and shipped with packaged builds (see `build.files` in
package.json). The application's own license is Apache-2.0, in `LICENSE.md`,
which ships alongside this directory.

- `bootstrap-icons.txt` — the icon path data in
  `renderer/components/util/icons.js` (Bootstrap Icons, MIT, The Bootstrap
  Authors), copied via react-icons before that dependency's removal.
- `bitcoincashjs2-lib.txt` — the bitcoin primitives ported into
  `main/common/bitcoin/` from `@bitcoin-dot-com/bitcoincashjs2-lib` 4.1.0
  (MIT, bitcoinjs-lib contributors) before that dependency's removal.
- `bitcoincash-ops.txt` — the opcode table in
  `main/common/bitcoin/opcodes.json`, copied byte-for-byte from
  `bitcoincash-ops` 2.0.0 (MIT, a Bitcoin-com fork of bitcoin-ops by Daniel
  Cousens; upstream `github.com/Bitcoin-com/bitcoincash-ops` @ `6ab82cc`)
  when the vendored fork moved in-house.
- `pushdata-bitcoin.txt` — the OP_PUSHDATA encoding ported into
  `main/common/bitcoin/pushdata.js` from `pushdata-bitcoin` 1.2.1 (MIT,
  Daniel Cousens; upstream `github.com/Bitcoin-com/pushdata-bitcoin` @
  `9b75eeb`) when the vendored fork moved in-house.
