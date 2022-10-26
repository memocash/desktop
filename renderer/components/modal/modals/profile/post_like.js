import Modal from "../../modal";
import styles from "../../../../styles/modal.module.css";
import profile from "../../../../styles/profile.module.css";
import {address, opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import {useEffect, useRef} from "react";
import Post from "../../../wallet/memo/post";
import bitcoin from "../../../util/bitcoin";
import GetWallet from "../../../util/wallet";
import {CreateTransaction} from "../../../wallet/snippets/create_tx";
import {GetMaxValue} from "../../../util/send";
import {useReferredState} from "../../../util/state";
import {Modals} from "../../../../../main/common/util";
import {GetUtxosRef} from "../../../util/utxos";

const PostLike = ({basic: {setModal, onClose, setChatRoom}, modalProps: {txHash}}) => {
    const utxosRef = GetUtxosRef()
    const [post, postRef, setPost] = useReferredState({})
    const tipInputRef = useRef()
    const [maxValue, maxValueRef, setMaxValue] = useReferredState(0)
    useEffect(async () => {
        const {addresses} = await window.electron.getWallet()
        const post = await window.electron.getPost({txHash, userAddresses: addresses})
        setPost(post)
    }, [txHash])
    useEffect(async () => {
        setMaxValue(Math.max(0, await GetMaxValue()))
    }, [utxosRef])
    const formLikeSubmit = async (e) => {
        e.preventDefault()
        const tip = tipInputRef.current.value
        if (tip && tip > maxValueRef.current.value) {
            window.electron.showMessageDialog("Tip too high (max: " + maxValueRef.current.value + ")")
            return
        } else if (tip > 0 && tip < bitcoin.Fee.DustLimit) {
            window.electron.showMessageDialog("Tip too low (min: " + bitcoin.Fee.DustLimit + ")")
            return
        }
        const likeOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(bitcoin.Prefix.LikeMemo, "hex"),
            Buffer.from(txHash, "hex").reverse(),
        ])
        const wallet = await GetWallet()
        let outputs = [{script: likeOpReturnOutput}]
        if (tip > 0) {
            outputs.push({value: tip, script: address.toOutputScript(postRef.current.address)})
            await CreateTransaction(wallet, outputs, setModal, () => setModal(Modals.Post, {txHash}), "", true)
        }
        else{
            await CreateTransaction(wallet, outputs, setModal, () => setModal(Modals.Post, {txHash}))
        }
    }
    return (
        <Modal onClose={onClose}>
            <Post post={post} setModal={setModal} isSingle={true} setChatRoom={setChatRoom}/>
            <div className={profile.set_profile}>
                <form onSubmit={formLikeSubmit}>
                    <label>
                        <span>Tip (max: {maxValue.toLocaleString()}):</span>
                    </label>
                    {" "}
                    <input ref={tipInputRef} type="number"/>
                    <input type="submit" value="Like"/>
                </form>
            </div>
            <div className={styles.buttons}>
                <button onClick={onClose}>Close</button>
            </div>
        </Modal>
    )
}

export default PostLike
