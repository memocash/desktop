import Modal from "../../modal";
import {Modals} from "../../../../../main/common/util"
import profile from "../../../../styles/profile.module.css";
import FollowList from "../../../wallet/memo/follow_list";
import styles from "../../../../styles/modal.module.css"
import ProfileInfoLight from "../snippets/profile_info_light";

const Following = ({setModal, modalProps: {address, addresses}, showFollowers = false}) => {
    const onClose = () => setModal(Modals.None)
    // addresses is the viewed address's linked-address cluster when opened
    // from the profile view; callers that don't resolve links pass just the
    // single address.
    const listAddresses = (addresses && addresses.length) ? addresses : [address]
    return (
        <Modal onClose={onClose}>
            <ProfileInfoLight setModal={setModal} address={address} addresses={listAddresses}>
                {showFollowers ? " followers" : " following"}
            </ProfileInfoLight>
            <div className={profile.body_modal}>
                <FollowList addresses={listAddresses} setModal={setModal} showFollowers={showFollowers}/>
            </div>
            <div className={styles.buttons}>
                <button onClick={() => setModal(Modals.None)}>Close</button>
            </div>
        </Modal>
    )
}

export default Following
