import {useEffect, useRef, useState} from "react";
import GetWallet from "../util/wallet";
import form from "../../styles/form.module.css";
import bitcoin from "../util/bitcoin";
import {address, script, opcodes} from "@bitcoin-dot-com/bitcoincashjs2-lib";

const Contacts = ({lastUpdate}) => {
    const setNameRef = useRef("")
    const [profileInfo, setProfileInfo] = useState({
        mame: "memo",
        profile: "Verification: https://twitter.com/memobch/status/992033652765700097",
    })
    const utxosRef = useRef([])
    useEffect(async () => {
        const wallet = await GetWallet()
        const profileInfo = await window.electron.getProfileInfo(wallet.addresses)
        if (profileInfo !== undefined) {
            setProfileInfo(profileInfo)
        }
        utxosRef.current.value = await window.electron.getUtxos(wallet.addresses)
        utxosRef.current.value.sort((a, b) => {
            return b.value - a.value
        })
    }, [lastUpdate])
    const formSetNameSubmit = async (e) => {
        e.preventDefault()
        const name = setNameRef.current.value
        if (name && name.length > bitcoin.MaxOpReturn) {
            window.electron.showMessageDialog("Name length is too long (max: " + bitcoin.MaxOpReturn + ")")
            return
        }
        const wallet = await GetWallet()
        let requiredInput = bitcoin.Fee.Base + bitcoin.Fee.OutputFeeOpReturn + bitcoin.Utf8ByteLength(name)
        let totalInput = 0
        let inputs = []
        for (let i = 0; i < utxosRef.current.value.length; i++) {
            const utxo = utxosRef.current.value[i]
            inputs.push([utxo.hash, utxo.index, utxo.value, utxo.address].join(":"))
            requiredInput += bitcoin.Fee.InputP2PKH
            totalInput += parseInt(utxo.value)
            if (totalInput === requiredInput || totalInput > requiredInput + bitcoin.Fee.OutputP2PKH + bitcoin.DustLimit) {
                break
            }
        }
        const changeAddress = wallet.addresses[0]
        const change = totalInput === requiredInput ? 0 : totalInput - requiredInput - bitcoin.Fee.OutputP2PKH
        const nameOpReturnOutput = script.compile([opcodes.OP_RETURN, Buffer.from("6d01", "hex"), Buffer.from(name)])
        let outputs = [
            nameOpReturnOutput.toString("hex") + ":0",
            address.toOutputScript(changeAddress).toString("hex") + ":" + change,
        ]
        await window.electron.openPreviewSend({inputs, outputs})
    }
    return (
        <div>
            <p>
                Name: <b>{profileInfo.name}</b>
            </p>
            <p>
                Profile: <b>{profileInfo.profile}</b>
            </p>
            <form onSubmit={formSetNameSubmit}>
                <label>
                    <span className={form.span}>Set name:</span>
                    <input className={form.input} ref={setNameRef} type="text"/>
                </label>
                <input type="submit" value="Set"/>
            </form>
        </div>
    )
}

export default Contacts
