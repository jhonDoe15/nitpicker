//! `link-sinks.mts` of the ESLint plugin: the attributes, calls and assignments that make a value a link, a frame
//! source or a navigation target.
use crate::typescript::rules::signatures::unwrap;
use crate::typescript::rules::support::view::Node;

const ANCHOR_ELEMENTS: [&str; 2] = ["a", "area"];
const EMBED_ELEMENTS: [&str; 4] = ["iframe", "embed", "object", "frame"];
const FORM_ELEMENTS: [&str; 3] = ["form", "button", "input"];
const NAVIGATION_METHODS: [&str; 2] = ["assign", "replace"];
const ASSERTION_FORMS: [&str; 3] = ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression"];

fn name_of(node: Option<Node>) -> String {
    node.and_then(|node| node.name()).map(|name| name.into_owned()).unwrap_or_default()
}

fn jsx_name(node: Option<Node>) -> String {
    node.filter(|node| node.is("JSXIdentifier")).map(|node| name_of(Some(node))).unwrap_or_default()
}

fn is_link_component(tag: &str) -> bool {
    tag.ends_with("Link") || tag.ends_with("Anchor")
}

fn is_location(node: Node) -> bool {
    let value = unwrap(node, &ASSERTION_FORMS);
    if value.is("Identifier") {
        return value.name().as_deref() == Some("location");
    }
    value.is("MemberExpression")
        && !value.flag("computed")
        && name_of(value.node("property")) == "location"
        && name_of(value.node("object")) == "window"
}

/// `attributeSink`: the expression of an `href`, `src`, `action` or `formAction` attribute of an element that
/// follows it.
pub fn attribute_sink(node: Node) -> Option<Node> {
    let name = jsx_name(node.node("name"));
    let tag = jsx_name(node.parent().and_then(|parent| parent.node("name")));
    let value = node.node("value").filter(|value| value.is("JSXExpressionContainer")).and_then(|value| value.node("expression"));
    let matches = (name == "href" && (ANCHOR_ELEMENTS.contains(&tag.as_str()) || is_link_component(&tag)))
        || (name == "src" && EMBED_ELEMENTS.contains(&tag.as_str()))
        || ((name == "action" || name == "formAction") && FORM_ELEMENTS.contains(&tag.as_str()));
    value.filter(|value| matches && !value.is("JSXEmptyExpression"))
}

/// `callSink`: the first argument of `window.open`, `location.assign` or `location.replace`.
pub fn call_sink(node: Node) -> Option<Node> {
    let callee = node.node("callee").filter(|callee| callee.is("MemberExpression") && !callee.flag("computed"))?;
    let argument = node.list("arguments").first().copied().flatten()?;
    let method = name_of(callee.node("property"));
    let object = callee.node("object")?;
    let opens_window = method == "open" && !is_location(object) && name_of(Some(object)) == "window";
    let navigates = NAVIGATION_METHODS.contains(&method.as_str()) && is_location(object);
    ((opens_window || navigates) && !argument.is("SpreadElement")).then_some(argument)
}

/// `assignmentSink`: the value assigned to `location` or `location.href`.
pub fn assignment_sink(node: Node) -> Option<Node> {
    let left = node.node("left")?;
    let to_href = left.is("MemberExpression")
        && !left.flag("computed")
        && name_of(left.node("property")) == "href"
        && left.node("object").is_some_and(is_location);
    (node.text("operator").as_deref() == Some("=") && (to_href || is_location(left))).then(|| node.node("right")).flatten()
}
