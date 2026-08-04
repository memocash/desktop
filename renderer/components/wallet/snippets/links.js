import Linkify from "react-linkify";
import {useState} from "react";
import styles from "../../../styles/links.module.css";
import {SafeExternalUrl} from "../../../../main/common/util/urls";

const imageExtension = /^\/[a-zA-Z0-9]+\.(jpg|jpeg|png|gif|webp)$/

const GetImgurImage = (href) => {
    let url
    try {
        url = new URL(href)
    } catch (e) {
        return null
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        return null
    }
    if (url.hostname !== "i.imgur.com" || !imageExtension.test(url.pathname)) {
        return null
    }
    return "https://i.imgur.com" + url.pathname
}

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

const componentDecorator = (decoratedHref, decoratedText, key) => {
    const imgurImage = GetImgurImage(decoratedHref)
    if (imgurImage) {
        return <ImgurImage key={key} href={decoratedHref} src={imgurImage} text={decoratedText}/>
    }
    return <ExternalLink href={decoratedHref} key={key}>{decoratedText}</ExternalLink>
}

const Links = ({children}) => {
    return (
        <Linkify componentDecorator={componentDecorator}>
            {children}
        </Linkify>
    );
}

export default Links
