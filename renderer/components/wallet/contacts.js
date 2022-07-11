import {useEffect, useRef, useState} from "react";
import GetWallet from "../util/wallet";
import form from "../../styles/form.module.css";
import bitcoin from "../util/bitcoin";
import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import {CreateTransaction} from "./snippets/create_tx";

const Contacts = ({lastUpdate}) => {
    const setNameRef = useRef("")
    const [profileInfo, setProfileInfo] = useState({
        mame: "Not set",
        profile: "Not set",
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
        const nameOpReturnOutput = script.compile([opcodes.OP_RETURN, Buffer.from("6d01", "hex"), Buffer.from(name)])
        const wallet = await GetWallet()
        const recentSetName = await window.electron.getRecentSetName(wallet.addresses)
        let beatHash
        if (recentSetName && !recentSetName.block_hash) {
            beatHash = recentSetName.tx_hash
        }
        await CreateTransaction(wallet, utxosRef.current.value, nameOpReturnOutput, 0, beatHash)
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
