import Modal from "../../modal";
import {Modals} from "../../../../../main/common/util"
import profile from "../../../../styles/profile.module.css";
import FollowList from "../../../wallet/memo/follow_list";
import {Scopes} from "../../../util/activity";
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
                {/* These rows arrive with the profile the modal was opened
                    from, so an empty list waits on that sync, not the wallet's. */}
                <FollowList addresses={listAddresses} setModal={setModal} showFollowers={showFollowers}
                            scope={Scopes.Profile}/>
            </div>
            <div className={styles.buttons}>
                <button onClick={() => setModal(Modals.None)}>Close</button>
            </div>
        </Modal>
    )
}

export default Following
