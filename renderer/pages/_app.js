import React from 'react'
import Head from 'next/head'
import "../public/style.css"

// The policy previously set connect-src only, which - with no default-src to
// fall back on - left script execution entirely unrestricted. Each directive
// below is doing something specific:
//
// - script-src: the export loads every chunk from its own origin, so 'self' is
//   all the packaged build needs. No 'wasm-unsafe-eval': signing and key
//   derivation moved into main, and with them the tiny-secp256k1 wasm module -
//   the renderer no longer instantiates any. The Next dev server rebuilds
//   through eval, so development alone needs 'unsafe-eval'.
// - style-src needs 'unsafe-inline' for the style={{...}} attributes the table
//   components use to set their grid columns. Style attributes cannot execute
//   script, and there is no way to allow them without this.
// - img-src covers profile pics, which render as data: urls built from the
//   local cache, and the inline images linked in posts, which come from imgur.
// - connect-src keeps the previous value: graphql goes out through the main
//   process over ipc, so the renderer itself only talks to its own origin.
// - object-src/base-uri close off plugin embedding and <base> rewriting.
//
// frame-ancestors and sandbox are deliberately absent: both are ignored when a
// policy is delivered in a meta tag.
const isDev = process.env.NODE_ENV === "development"

const ContentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self'" + (isDev ? " 'unsafe-eval'" : ""),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://i.imgur.com",
    "connect-src 'self' http://localhost:10000",
    "object-src 'none'",
    "base-uri 'none'",
].join("; ")

function App({Component, pageProps}) {
    return (
        <>
            <Head>
                <title>Memo</title>
                <meta httpEquiv="Content-Security-Policy" content={ContentSecurityPolicy}/>
            </Head>
            <Component {...pageProps} />
        </>
    )
}

export default App;
