# Vendored packages

These two packages are dependencies of `@bitcoin-dot-com/bitcoincashjs2-lib`
that upstream resolves as `git+ssh://` URLs into the abandoned Bitcoin-com
GitHub org. That resolution has no registry integrity metadata, requires SSH
access to GitHub on every install, and breaks unreproducibly if the org or
repos ever disappear. The code itself is tiny and frozen, so it lives here
instead, wired in through the `overrides` block in the root `package.json`.

Provenance — files are byte-for-byte copies of the shipped files at the
commits the old lockfile pinned:

- `pushdata-bitcoin/` from
  `github.com/Bitcoin-com/pushdata-bitcoin` @ `9b75eebe597853c6eeaec3e6c44b6d9c9cd7ee86` (tag 1.2.1)
- `bitcoincash-ops/` from
  `github.com/Bitcoin-com/bitcoincash-ops` @ `6ab82cc7326c67236f3b2d9d0457258ac2ef48e3` (tag 2.0.0)

Each `package.json` is trimmed to what installation needs (dev-only fields
dropped; `pushdata-bitcoin`'s dependency on `bitcoincash-ops` now points at
its sibling directory here rather than at GitHub). Everything else — code,
LICENSE, README — is unmodified.

Both packages exist only to serve `@bitcoin-dot-com/bitcoincashjs2-lib`;
when that library is replaced (audit finding D4), this directory goes with it.
