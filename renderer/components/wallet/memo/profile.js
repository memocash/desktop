import Modal from "../../modal/modal";
import seed from "../../modal/seed.module.css";

const Profile = ({onClose, address}) => {
    return (
        <Modal onClose={onClose}>
            <div className={seed.root}>
                Profile!
                <p>
                    Address: {address}
                </p>
                <button onClick={onClose}>Close</button>
            </div>
        </Modal>
    )
}

export default Profile
