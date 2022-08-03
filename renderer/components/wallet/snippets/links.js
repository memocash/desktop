import Linkify from "react-linkify";

const componentDecorator = (decoratedHref, decoratedText, key) => (
    <a target="_blank" href={decoratedHref} key={key}>
        {decoratedText}
    </a>
)

const Links = ({children}) => {
    return (
        <Linkify componentDecorator={componentDecorator}>
            {children}
        </Linkify>
    );
}

export default Links
