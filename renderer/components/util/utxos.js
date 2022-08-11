import {useEffect, useRef} from "react";
import GetWallet from "./wallet";

let utxosRef

const GetUtxosRef = () => {
    return utxosRef
}

const Utxos = ({lastUpdate}) => {
    utxosRef = useRef([])
    useEffect(async () => {
        const wallet = await GetWallet()
        utxosRef.current.value = await window.electron.getUtxos(wallet.addresses)
        utxosRef.current.value.sort((a, b) => {
            return b.value - a.value
        })
    }, [lastUpdate])
    return (<></>)
}

export {
    GetUtxosRef,
    Utxos,
}
