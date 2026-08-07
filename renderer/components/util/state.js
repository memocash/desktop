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

// Column-header sorting for the modal tables: first click on a column sorts
// descending, clicking it again reverses. Owns the column/direction state and
// re-sorts the ref-backed list the caller renders.
const useSortToggle = (listRef, setList, defaultCol) => {
    const [sortCol, sortColRef, setSortCol] = useReferredState(defaultCol)
    const [sortDesc, sortDescRef, setSortDesc] = useReferredState(false)
    const sortBy = (field) => {
        const desc = sortColRef.current === field ? !sortDescRef.current : true
        if (desc) {
            listRef.current.sort((a, b) => (a[field] > b[field]) ? 1 : -1)
        } else {
            listRef.current.sort((a, b) => (a[field] < b[field]) ? 1 : -1)
        }
        setList([...listRef.current])
        setSortDesc(desc)
        setSortCol(field)
    }
    return {sortCol, sortDesc, sortBy}
}

export {
    useReferredState,
    useSortToggle,
}
