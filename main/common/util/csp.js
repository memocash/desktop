// The renderer's Content-Security-Policy, stated once. The html shells that
// scripts/build-renderer.js writes carry it into every document as a meta tag,
// and the app:// protocol handler sends it as a response header over
// everything it serves - two deliveries of the same policy, read from here so
// they cannot drift.
//
// Each directive is doing something specific:
//
// - script-src: every bundle loads from its own origin, so 'self' is all any
//   build needs. No 'wasm-unsafe-eval': signing and key derivation moved into
//   main, and with them the tiny-secp256k1 wasm module - the renderer no
//   longer instantiates any. No 'unsafe-eval' either: esbuild rebuilds are
//   plain script files, unlike the Next dev server this replaced, so
//   development runs under the same policy as the packaged build.
// - style-src needs 'unsafe-inline' for the style={{...}} attributes the table
//   components use to set their grid columns. Style attributes cannot execute
//   script, and there is no way to allow them without this.
// - img-src covers profile pics, which render as data: urls built from the
//   local cache, and the inline images linked in posts, which come from imgur.
// - connect-src: graphql goes out through the main process over ipc, so the
//   renderer itself only ever talks to its own origin.
// - object-src/base-uri close off plugin embedding and <base> rewriting.
const ContentSecurityPolicy = () => [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://i.imgur.com",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
].join("; ")

// What the header can say that the meta tag cannot: frame-ancestors is ignored
// in a meta policy, so a document delivered with only the tag could still be
// framed. It rides the header alone - putting it in the tag too would just
// have every page log that it was ignored. The header always speaks for the
// packaged build, since only the packaged build serves app:// - development
// runs on the local dev server, meta tag only.
const ContentSecurityPolicyHeader = () =>
    ContentSecurityPolicy() + "; frame-ancestors 'none'"

module.exports = {
    ContentSecurityPolicy,
    ContentSecurityPolicyHeader,
}
