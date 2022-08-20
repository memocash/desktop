import Modal from "../../modal";
import {useEffect, useRef, useState} from "react";
import profile from "../../../../styles/profile.module.css"
import modalStyles from "../../../../styles/modal.module.css"
import {TitleCol} from "../../../wallet/snippets/title_col";
import {TimeSince} from "../../../util/time";
import {BsBoxArrowInUpRight} from "react-icons/bs";
import {useReferredState} from "../../../util/state";
import {Modals} from "../../../../../main/common/util";
import ProfileInfoLight from "../snippets/profile_info_light";

const Column = {
    Room: "room",
    Timestamp: "timestamp",
}

const RoomFollowing = ({basic: {setModal, setChatRoom}, modalProps: {address}}) => {
    const [sortCol, sortColRef, setSortCol] = useReferredState(Column.Timestamp)
    const [sortDesc, sortDescRef, setSortDesc] = useReferredState(false)
    const [follows, followsRef, setFollows] = useReferredState([])
    useEffect(async () => {
        const follows = await window.electron.getChatFollows({addresses: [address]})
        setFollows(follows)
    }, [address])
    const onClose = () => setModal(Modals.None)
    const sortFollows = (field) => {
        let desc = sortDescRef.current
        if (sortColRef.current === field) {
            desc = !desc
        } else {
            desc = true
        }
        if (desc) {
            followsRef.current.sort((a, b) => (a[field] > b[field]) ? 1 : -1)
        } else {
            followsRef.current.sort((a, b) => (a[field] < b[field]) ? 1 : -1)
        }
        setFollows([...followsRef.current])
        setSortDesc(desc)
        setSortCol(field)
    }
    const openTx = async (txHash) => await window.electron.openTransaction({txHash})
    const clickRoom = (room) => {
        setChatRoom(room)
        setModal(Modals.None)
    }
    return (
        <Modal onClose={onClose}>
            <ProfileInfoLight setModal={setModal} address={address}>
                {" "}rooms
            </ProfileInfoLight>
            {follows.length ? <div className={[profile.likes_list, profile.follows_list].join(" ")}>
                <div className={profile.row}>
                    <TitleCol sortFunc={sortFollows} desc={sortDesc} sortCol={sortCol} col={Column.Room}
                              title={"Room"}/>
                    <TitleCol sortFunc={sortFollows} desc={sortDesc} sortCol={sortCol} col={Column.Timestamp}
                              title={"Timestamp"}/>
                </div>
                {follows.map((follow, i) => {
                    return (
                        <div key={i} className={profile.row}>
                            <div>
                                <a onClick={() => clickRoom(follow.room)}>{follow.room}</a>
                            </div>
                            <div>
                                {TimeSince(follow.timestamp)}
                                <button onClick={() => openTx(follow.tx_hash)}><BsBoxArrowInUpRight/> Tx</button>
                            </div>
                        </div>
                    )
                })}
            </div> : <div className={profile.no_results}>Not in any rooms</div>}
            <div className={modalStyles.buttons}>
                <button onClick={onClose}>Close</button>
            </div>
        </Modal>
    )
}

export default RoomFollowing
