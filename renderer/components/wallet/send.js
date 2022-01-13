import {useRef} from "react";
import form from "../../styles/form.module.css"

const Send = () => {
    const payToRef = useRef()
    const messageRef = useRef()
    const amountRef = useRef()
    const clickPreview = async () => {
        const payTo = payToRef.current.value
        const message = messageRef.current.value
        const amount = amountRef.current.value
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
    }
    return (
        <div>
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
                <button onClick={clickPreview}>Preview</button>
            </p>
        </div>
    )
}

export default Send
