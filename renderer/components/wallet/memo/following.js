import Modal from "../../modal/modal";
import {Modals} from "./index";
import profile from "../../../styles/profile.module.css";

const Following = ({onClose, address, setModal}) => {
    return (
        <Modal onClose={onClose}>
            <div className={profile.header_modal}>
                <div className={profile.info}>
                    <p>Following modal: {address}</p>
                    <p>
                        <button onClick={() => setModal(Modals.Profile)}>Back to Profile</button>
                        <button onClick={() => setModal(Modals.None)}>Close</button>
                    </p>
                </div>
            </div>
        </Modal>
    )
}

export default Following
