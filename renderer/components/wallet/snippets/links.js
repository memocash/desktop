import {useState} from "react";
import styles from "../../../styles/links.module.css";
import {SafeExternalUrl} from "../../../../main/common/util/urls";
import {LinkSegments} from "../../../../main/common/util/linkify";

const ImgurImage = ({href, src, text}) => {
    const [loaded, setLoaded] = useState(false)
    const [failed, setFailed] = useState(false)
    if (failed) {
        return <ExternalLink href={href}>{text}</ExternalLink>
    }
    if (!loaded) {
        return <span className={styles.image_prompt}>
            <ExternalLink href={href}>{text}</ExternalLink>
            {" (i.imgur.com) "}
            <button type="button" onClick={() => setLoaded(true)}>Load image preview</button>
        </span>
    }
    return (
        <ExternalLink href={href} className={styles.image_link}>
            <img alt={text} src={src} className={styles.image} onError={() => setFailed(true)}/>
        </ExternalLink>
    )
}

const ExternalLink = ({href, className, children}) => {
    const safeUrl = SafeExternalUrl(href)
    if (!safeUrl) {
        return children
    }
    return <a href={safeUrl} className={className} onClick={(e) => {
        e.preventDefault()
        window.electron.openExternal(safeUrl)
    }}>{children}</a>
}

// All decisions - what matched, what is safe to click, what gets a preview
// offer - are made (and tested) in LinkSegments; this only maps segments to
// elements.
const Links = ({children}) => {
    if (typeof children !== "string" || children === "") {
        return children
    }
    return LinkSegments(children).map((segment, i) => {
        if (!segment.url) {
            return segment.text
        }
        if (segment.imgurSrc) {
            return <ImgurImage key={i} href={segment.url} src={segment.imgurSrc} text={segment.text}/>
        }
        return <ExternalLink key={i} href={segment.url}>{segment.text}</ExternalLink>
    })
}

export default Links
