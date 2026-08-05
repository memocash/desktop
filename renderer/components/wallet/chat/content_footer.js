import styles from "../../../styles/chat.module.css";
import {useEffect, useState} from "react";
import {Modals} from "../../../../main/common/util";
import bitcoin from "../../util/bitcoin";
import {opcodes, script} from "../../util/bitcoincash";
import {CreateTransaction} from "../snippets/create_tx";
import GetWallet from "../../util/wallet";
import {ByteCounter} from "../../modal/snippets/byte_counter";

// The counter stays hidden until the message is close to filling the output, so
// the sender bar is uncluttered for the short messages that are the common case.
const CounterBytes = 25

const ContentFooter = ({room, setModal, setRoom}) => {
    const [message, setMessage] = useState("")
    const [disableMessageForm, setDisableMessageForm] = useState(true)
    useEffect(() => {
        if (!room || !room.length) {
            setDisableMessageForm(true)
            return
        }
        setDisableMessageForm(false)
    }, [room])
    // The room name shares the OP_RETURN output with the message, so the longer
    // the room name, the less room a message in it has.
    const maxBytes = bitcoin.Fee.MaxOpReturn - bitcoin.Fee.OpPushDataBase - bitcoin.Utf8ByteLength(room)
    const usedBytes = bitcoin.Utf8ByteLength(message)
    const canSend = usedBytes > 0 && usedBytes <= maxBytes
    const formSubmitHandler = async (e) => {
        e.preventDefault()
        if (!canSend) {
            return
        }
        const chatPostOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(bitcoin.Prefix.ChatPost, "hex"),
            Buffer.from(room),
            Buffer.from(message),
        ])
        await CreateTransaction(await GetWallet(), [{script: chatPostOpReturnOutput}], setModal)
        setMessage("")
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
                <input type={"text"} placeholder={"Type a message..."} value={message}
                       onChange={(e) => setMessage(e.target.value)}/>
                {maxBytes - usedBytes <= CounterBytes &&
                    <ByteCounter used={usedBytes} max={maxBytes} className={styles.sender_counter}/>}
                <input type={"submit"} value={"Send"} disabled={!canSend}/>
            </fieldset>
        </form>
    )
}

export default ContentFooter
