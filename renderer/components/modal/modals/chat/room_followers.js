import Modal from "../../modal";
import {useEffect, useRef} from "react";
import profile from "../../../../styles/profile.module.css"
import modalStyles from "../../../../styles/modal.module.css"
import {TitleCol} from "../../../wallet/snippets/title_col";
import {TimeSince} from "../../../util/time";
import {BsBoxArrowInUpRight} from "react-icons/bs";
import {useReferredState} from "../../../util/state";
import {Modals} from "../../../../../main/common/util";

const Column = {
    Name: "name",
    Timestamp: "timestamp",
}

const RoomFollowers = ({basic: {setModal, onClose}, modalProps: {room}}) => {
    const [sortCol, sortColRef, setSortCol] = useReferredState(Column.Timestamp)
    const [sortDesc, sortDescRef, setSortDesc] = useReferredState(false)
    const [follows, followsRef, setFollows] = useReferredState([])
    useEffect(() => {(async () => {
        const follows = await window.electron.getChatRoomFollows({room})
        console.log(follows)
        setFollows(follows)
    })()}, [room])
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
    const setProfile = (address) => setModal(Modals.ProfileView, {address})
    const openTx = async (txHash) => await window.electron.openTransaction({txHash})
    return (
        <Modal onClose={onClose}>
            <div className={profile.list_header}>
                <h2>{room} members</h2>
            </div>
            {follows.length ? <div className={[profile.likes_list, profile.follows_list].join(" ")}>
                <div className={profile.row}>
                    <TitleCol sortFunc={sortFollows} desc={sortDesc} sortCol={sortCol} col={Column.Name} title={"Name"}/>
                    <TitleCol sortFunc={sortFollows} desc={sortDesc} sortCol={sortCol} col={Column.Timestamp}
                              title={"Timestamp"}/>
                </div>
                {follows.map((follow, i) => {
                    return (
                        <div key={i} className={profile.row}>
                            <div className={profile.imgWrapper} onClick={() => setProfile(follow.address)}>
                                <img alt={"Pic"} className={profile.img} src={(follow.pic_data && follow.pic_data.length) ?
                                    `data:image/png;base64,${Buffer.from(follow.pic_data).toString("base64")}` :
                                    "/default-profile.jpg"}/>
                                {follow.name}
                            </div>
                            <div>
                                {TimeSince(follow.timestamp)}
                                <button onClick={() => openTx(follow.tx_hash)}><BsBoxArrowInUpRight/> Tx</button>
                            </div>
                        </div>
                    )
                })}
            </div> : <div className={profile.no_results}>No followers</div>}
            <div className={modalStyles.buttons}>
                <button onClick={onClose}>Close</button>
            </div>
        </Modal>
    )
}

export default RoomFollowers
