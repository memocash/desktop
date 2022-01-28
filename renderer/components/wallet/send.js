import {useRef} from "react";

const {address} = require("@bitcoin-dot-com/bitcoincashjs2-lib");
import form from "../../styles/form.module.css"
import bitcoin from "../util/bitcoin";

const Send = () => {
    const payToRef = useRef()
    const messageRef = useRef()
    const amountRef = useRef()
    const formSubmit = async (e) => {
        e.preventDefault()
        const payTo = payToRef.current.value
        const message = messageRef.current.value
        const amount = amountRef.current.value
        if (amount < bitcoin.DustLimit) {
            window.electron.showMessageDialog("Amount must be above dust limit (546)")
            return
        }
        try {
            address.fromBase58Check(payTo)
        } catch (err) {
            window.electron.showMessageDialog("Unable to parse address: " + err.toString())
            return
        }
        const query = `
    query ($address: String!) {
        address(address: $address) {
            utxos {
                hash
                index
                amount
            }
        }
    }
    `
        const wallet = await window.electron.getWallet()
        let data = await window.electron.graphQL(query, {
            address: wallet.addresses[0],
        })
        console.log(data.data.address.utxos)
        await window.electron.openPreviewSend({payTo, message, amount})
    }
    return (
        <form onSubmit={formSubmit}>
            <p>
                <label>
                    <span className={form.span}>Pay to:</span>
                    <input className={form.input} ref={payToRef} type="text" autoFocus/>
                </label>
            </p>
            <p>
                <label>
                    <span className={form.span}>Message (optional):</span>
                    <input className={form.input} ref={messageRef} type="text"/>
                </label>
            </p>
            <p>
                <label>
                    <span className={form.span}>Amount (sats):</span>
                    <input className={form.input_small} ref={amountRef} type="text"/>
                </label>
            </p>
            <p>
                <input type="submit" value="Preview"/>
            </p>
        </form>
    )
}

export default Send
