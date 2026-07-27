import {useCallback, useEffect, useRef, useState} from "react"

const MinColumnWidth = 32

// Column sizing for the wallet's grid tables. Columns start sized to their
// content with a flexible filler track at the end, so values sit next to the
// data they belong to instead of being stretched across the window. Dragging a
// divider switches every column to explicit pixel widths, which keeps the
// columns the user did not touch from reflowing as one is resized.
const useResizableColumns = (count) => {
    const [widths, setWidths] = useState(null)
    const gridRef = useRef()
    const dragRef = useRef(null)

    const gridTemplateColumns = widths ?
        widths.map(width => width + "px").join(" ") + " minmax(0, 1fr)" :
        Array(count).fill("max-content").join(" ") + " minmax(0, 1fr)"

    const startResize = useCallback((index, e) => {
        e.preventDefault()
        e.stopPropagation()
        const grid = gridRef.current
        if (!grid) {
            return
        }
        // Computed grid tracks are always resolved pixel values, including the
        // trailing filler, which is dropped here since it stays flexible.
        const current = getComputedStyle(grid).gridTemplateColumns
            .split(" ").map(width => parseFloat(width)).slice(0, count)
        if (current.some(width => !isFinite(width))) {
            return
        }
        dragRef.current = {index, startX: e.clientX, startWidths: current}
        setWidths(current)
    }, [count])

    useEffect(() => {
        const move = (e) => {
            const drag = dragRef.current
            if (!drag) {
                return
            }
            const next = [...drag.startWidths]
            next[drag.index] = Math.max(MinColumnWidth,
                Math.round(drag.startWidths[drag.index] + e.clientX - drag.startX))
            setWidths(next)
        }
        const stop = () => dragRef.current = null
        window.addEventListener("mousemove", move)
        window.addEventListener("mouseup", stop)
        return () => {
            window.removeEventListener("mousemove", move)
            window.removeEventListener("mouseup", stop)
        }
    }, [])

    // Double-clicking a divider drops back to content sizing for every column.
    const resetColumns = useCallback(() => setWidths(null), [])

    return {gridRef, gridTemplateColumns, startResize, resetColumns}
}

export {
    useResizableColumns,
}
