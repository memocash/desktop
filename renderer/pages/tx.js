import {useRouter} from "next/router";
import {useEffect, useState} from "react";
import Head from "next/head";
import form from "../styles/form.module.css";
import styleTx from "../styles/tx.module.css";

const Tx = () => {
    const router = useRouter()
    const [transactionId, setTransactionId] = useState("f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16")
    const [inputPayTo, setInputPayTo] = useState()
    const [inputMessage, setInputMessage] = useState()
    const [inputAmount, setInputAmount] = useState()

    useEffect(() => {
        if (!router || !router.query || !router.query.payTo || !router.query.amount) {
            return
        }
        const {payTo, message, amount} = router.query
        setInputPayTo(payTo)
        setInputMessage(message)
        setInputAmount(amount)
    }, [router])
    return (
        <div>
            <Head>
                <title>Transaction</title>
            </Head>
            <div>
                <div className={styleTx.header}>
                    <label>Transaction ID:</label><br/>
                    <input type="text" value={transactionId} className={form.input_wide} spellCheck="false" readOnly/>
                    <br/>
                    Status: Unconfirmed<br/>
                    Date: 2009-01-11 19:30<br/>
                    {inputMessage ? <>Message: {inputMessage}<br/></> : null}
                    Amount: {inputAmount} satoshis<br/>
                    Amount received: 5,000,000,000 satoshis<br/>
                    Size: 275 bytes<br/>
                    Fee: 0 satoshis (0 sat/byte)
                </div>
                <div>
                    <div className={styleTx.input_output_head}>Inputs (1)</div>
                    <div className={styleTx.input_output_box}>
                        <p>
                            0437cd7f8525ceed2324359c2d0ba26006d92d856a9c20fa0241106ee5a597c9:0
                            &nbsp;&nbsp;&nbsp;&nbsp;
                            5,000,000,000
                        </p>
                    </div>
                </div>
                <div>
                    <div className={styleTx.input_output_head}>Outputs (2)</div>
                    <div className={styleTx.input_output_box}>
                        <p>
                            {inputPayTo}
                            &nbsp;&nbsp;&nbsp;&nbsp;
                            1,000,000,000
                        </p>
                        <p>
                            {inputPayTo}
                            &nbsp;&nbsp;&nbsp;&nbsp;
                            4,000,000,000
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Tx
