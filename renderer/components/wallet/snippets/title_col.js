import styles from "../../../styles/history.module.css";

// A sortable column heading with a drag handle on its right edge. index/columns
// come from useResizableColumns; when they are omitted the heading is still
// sortable, just not resizable.
const TitleCol = ({title, col, sortCol, desc, sortFunc, index, columns}) => {
    const sorted = col === sortCol
    return (
        <span className={styles.titleCol}>
            <button className={styles.titleSort} onClick={() => sortFunc(col)}
                    aria-label={`Sort by ${typeof title === "string" ? title : col}`}
                    aria-sort={sorted ? (desc ? "descending" : "ascending") : "none"}>
                {title} {sorted ? (desc ? <>&darr;</> : <>&uarr;</>) : null}
            </button>
            {columns ? <span className={styles.titleHandle} role={"separator"} aria-orientation={"vertical"}
                             title={"Drag to resize, double-click to reset"}
                             onMouseDown={(e) => columns.startResize(index, e)}
                             onDoubleClick={columns.resetColumns}/> : null}
        </span>
    )
}

export {
    TitleCol,
}
