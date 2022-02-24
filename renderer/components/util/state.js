import {useRef, useState} from "react";

const useReferredState = (initialValue) => {
    const [state, setState] = useState(initialValue)
    const reference = useRef(state)

    const setReferredState = value => {
        reference.current = value
        setState(value)
    }

    return [state, reference, setReferredState]
}

export {
    useReferredState,
}
