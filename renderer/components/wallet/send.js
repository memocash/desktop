import {useRef} from "react";
import form from "../../styles/form.module.css"

const Send = () => {
    const payToRef = useRef()
    const messageRef = useRef()
    const amountRef = useRef()
    return (
        <div>
            <p>
                <label>
                    <span className={form.span}>Pay to:</span>
                    <input className={form.input} ref={payToRef} type="text" autoFocus/>
                </label>
            </p>
            <p>
                <label>
                    <span className={form.span}>Message (optional):</span>
                    <input className={form.input} ref={messageRef} type="text"/>
                </label>
            </p>
            <p>
                <label>
                    <span className={form.span}>Amount:</span>
                    <input className={form.input_small} ref={amountRef} type="text"/>
                </label>
            </p>
            <p>
                <button>Preview</button>
            </p>
        </div>
    )
}

export default Send
