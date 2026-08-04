import React from 'react'
import Head from 'next/head'
import "../public/style.css"
import {ContentSecurityPolicy} from "../../main/common/util"

// The policy itself lives in main/common/util/csp.js, beside the reasons for
// each directive: the app:// handler delivers the same one as a response
// header, and the two must not drift. The tag matters even so - it is the only
// delivery in development, where pages come from the Next dev server rather
// than app://, which is also why the dev-only 'unsafe-eval' is decided here.
const isDev = process.env.NODE_ENV === "development"

function App({Component, pageProps}) {
    return (
        <>
            <Head>
                <title>Memo</title>
                <meta httpEquiv="Content-Security-Policy" content={ContentSecurityPolicy(isDev)}/>
            </Head>
            <Component {...pageProps} />
        </>
    )
}

export default App;
