import React from 'react'
import Head from 'next/head'

function App({Component, pageProps}) {
    const CSP = "" +
        "connect-src 'self' http://localhost:10000;"
    return (
        <>
            <Head>
                <title>Memo Desktop</title>
                <meta httpEquiv="Content-Security-Policy" content={CSP}/>
            </Head>
            <Component {...pageProps} />
        </>
    )
}

export default App;
