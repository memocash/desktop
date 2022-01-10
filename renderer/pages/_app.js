import React from 'react'
import Head from 'next/head'
import "../public/style.css"

function App({Component, pageProps}) {
    return (
        <>
            <Head>
                <title>Memo</title>
                <meta httpEquiv="Content-Security-Policy" content="connect-src 'self' http://localhost:10000;"/>
            </Head>
            <Component {...pageProps} />
        </>
    )
}

export default App;
