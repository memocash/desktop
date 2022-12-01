import {useEffect, useRef, useState} from "react";
import GetWallet from "./wallet";
import {useReferredState} from "./state";

let utxosRef

const GetUtxosRef = () => {
    return utxosRef
}

const Utxos = ({lastUpdate}) => {
    const [_, utxos,setUtxos] = useReferredState([])
    useEffect(() => {
        utxosRef = utxos
    },[])
    useEffect(async () => {
        const wallet = await GetWallet()
        utxos.current.value = await window.electron.getUtxos(wallet.addresses)
        utxos.current.value.sort((a, b) => {
             return b.value - a.value
        })
    }, [lastUpdate])
    return (<></>)
}

export {
    GetUtxosRef,
    Utxos,
}
