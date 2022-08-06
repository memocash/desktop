const TitleCol = ({title, col, sortCol, desc, sortFunc}) => {
    return (
        <span onClick={() => sortFunc(col)}>
            {title} {col === sortCol &&
        <>
            {desc && <>&darr;</>}
            {!desc && <>&uarr;</>}
        </>
        }
        </span>
    )
}

export {
    TitleCol,
}
