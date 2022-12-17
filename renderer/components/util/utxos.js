import {useEffect} from "react";
import GetWallet from "./wallet";

let utxos
let utxosSetters = []

/** @param {function} setter */
const AddUtxoSetter = (setter) => {
    utxosSetters.push(setter)
    if (utxos) {
        setter(utxos)
    }
}

const GetUtxos = () => {
    return utxos
}

const Utxos = ({lastUpdate}) => {
    useEffect(async () => {
        const wallet = await GetWallet()
        utxos = await window.electron.getUtxos(wallet.addresses)
        utxos.sort((a, b) => {
            return b.value - a.value
        })
        for (let i = 0; i < utxosSetters.length; i++) {
            utxosSetters[i](utxos)
        }
    }, [lastUpdate])
    return (<></>)
}

export {
    AddUtxoSetter,
    GetUtxos,
    Utxos,
}
