import Linkify from "react-linkify";
import {useState} from "react";
import styles from "../../../styles/links.module.css";

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
    const [failed, setFailed] = useState(false)
    if (failed) {
        return <a target="_blank" href={href}>{text}</a>
    }
    return (
        <a target="_blank" href={href} className={styles.image_link}>
            <img alt={text} src={src} className={styles.image} onError={() => setFailed(true)}/>
        </a>
    )
}

const componentDecorator = (decoratedHref, decoratedText, key) => {
    const imgurImage = GetImgurImage(decoratedHref)
    if (imgurImage) {
        return <ImgurImage key={key} href={decoratedHref} src={imgurImage} text={decoratedText}/>
    }
    return (
        <a target="_blank" href={decoratedHref} key={key}>
            {decoratedText}
        </a>
    )
}

const Links = ({children}) => {
    return (
        <Linkify componentDecorator={componentDecorator}>
            {children}
        </Linkify>
    );
}

export default Links
