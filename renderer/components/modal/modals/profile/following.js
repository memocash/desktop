import Modal from "../../modal";
import {Modals} from "../../../../../main/common/util"
import profile from "../../../../styles/profile.module.css";
import FollowList from "../../../wallet/memo/follow_list";
import styles from "../../../../styles/modal.module.css"
import ProfileInfoLight from "../snippets/profile_info_light";

const Following = ({setModal, modalProps: {address}, showFollowers = false}) => {
    const onClose = () => setModal(Modals.None)
    return (
        <Modal onClose={onClose}>
            <ProfileInfoLight setModal={setModal} address={address}>
                {showFollowers ? " followers" : " following"}
            </ProfileInfoLight>
            <div className={profile.body_modal}>
                <FollowList addresses={[address]} setModal={setModal} showFollowers={showFollowers}/>
            </div>
            <div className={styles.buttons}>
                <button onClick={() => setModal(Modals.None)}>Close</button>
            </div>
        </Modal>
    )
}

export default Following
