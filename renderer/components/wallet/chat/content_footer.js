import styles from "../../../styles/chat.module.css";
import {useEffect, useRef, useState} from "react";
import {Modals} from "../../../../main/common/util";
import bitcoin from "../../util/bitcoin";
import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import {CreateTransaction} from "../snippets/create_tx";
import GetWallet from "../../util/wallet";

const ContentFooter = ({room, setModal, setRoom}) => {
    const messageRef = useRef()
    const [disableMessageForm, setDisableMessageForm] = useState(true)
    useEffect(() => {
        if (!room || !room.length) {
            setDisableMessageForm(true)
            return
        }
        setDisableMessageForm(false)
    }, [room])
    const formSubmitHandler = async (e) => {
        e.preventDefault()
        const message = messageRef.current.value
        const maxMessageSize = bitcoin.Fee.MaxOpReturn - bitcoin.Fee.OpPushDataBase - Buffer.from(room).length
        if (!message || !message.length) {
            return
        } else if (Buffer.from(message).length > maxMessageSize) {
            window.electron.showMessageDialog("Message too long (max length: " + maxMessageSize + ")")
            return
        }
        const chatPostOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(bitcoin.Prefix.ChatPost, "hex"),
            Buffer.from(room),
            Buffer.from(message),
        ])
        await CreateTransaction(await GetWallet(), [{script: chatPostOpReturnOutput}])
        messageRef.current.value = ""
    }
    const formClickHandler = () => {
        if (!disableMessageForm) {
            return
        }
        clickOpenRoomModal()
    }
    const clickOpenRoomModal = () => setModal(Modals.ChatRoomLoad, {setRoom})
    return (
        <form className={styles.sender} onSubmit={formSubmitHandler} onClick={formClickHandler}>
            <fieldset disabled={disableMessageForm}>
                <input ref={messageRef} type={"text"} placeholder={"Type a message..."}/>
                <input type={"submit"} value={"Send"}/>
            </fieldset>
        </form>
    )
}

export default ContentFooter
