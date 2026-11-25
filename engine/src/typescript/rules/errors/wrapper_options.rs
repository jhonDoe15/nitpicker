use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::{Node, Value};

/// One entry of the rule's `wrappers` option.
#[derive(Clone, Debug, Default)]
pub struct Wrapper {
    pub name: Option<String>,
    pub options_index: Option<usize>,
    pub classification_index: Option<usize>,
    pub unclassified_value: Option<String>,
}

const SETTING: &str = "preserve-error-cause.options";

fn index(entry: &serde_json::Value, key: &str) -> Option<usize> {
    entry.get(key).and_then(serde_json::Value::as_u64).map(|number| number as usize)
}

fn default_wrappers() -> Vec<Wrapper> {
    vec![Wrapper { name: Some("Error".to_string()), options_index: Some(1), ..Wrapper::default() }]
}

/// The configured wrappers, or the rule's default when the options do not name any.
pub fn wrappers(context: &Context) -> Vec<Wrapper> {
    let options = context.setting(SETTING).and_then(|json| serde_json::from_str::<serde_json::Value>(json).ok());
    let Some(entries) = options.as_ref().and_then(|options| options.get("wrappers")).and_then(serde_json::Value::as_array) else {
        return default_wrappers();
    };
    entries
        .iter()
        .map(|entry| Wrapper {
            name: entry.get("name").and_then(serde_json::Value::as_str).map(String::from),
            options_index: index(entry, "optionsIndex"),
            classification_index: index(entry, "classificationIndex"),
            unclassified_value: entry.get("unclassifiedValue").and_then(serde_json::Value::as_str).map(String::from),
        })
        .collect()
}

fn is_error_subclass(name: &str) -> bool {
    name.ends_with("Error")
}

fn wrapper_for(wrappers: &[Wrapper], name: &str) -> Option<Wrapper> {
    let configured = wrappers.iter().find(|candidate| candidate.name.as_deref() == Some(name));
    configured.cloned().or_else(|| is_error_subclass(name).then(Wrapper::default))
}

/// The literal of an argument as the rule compares it: nothing when it is no literal, its text when it is a string.
enum Classified {
    Absent,
    Text(String),
    Other,
}

fn classified(argument: Option<Node>) -> Classified {
    let Some(literal) = argument.filter(|argument| argument.is("Literal")) else { return Classified::Absent };
    match literal.get("value") {
        value @ Value::Text(..) => literal.view.text(value).map_or(Classified::Other, |text| Classified::Text(text.into_owned())),
        _ => Classified::Other,
    }
}

pub fn argument<'v>(node: Node<'v>, index: usize) -> Option<Node<'v>> {
    node.list("arguments").get(index).copied().flatten()
}

/// `matchingWrapper`: the wrapper a `new` expression is checked against.
pub fn matching_wrapper(wrappers: &[Wrapper], node: Node) -> Option<Wrapper> {
    let callee = node.node("callee").filter(|callee| callee.is("Identifier"))?;
    let wrapper = wrapper_for(wrappers, callee.name()?.as_ref())?;
    let Some(position) = wrapper.classification_index else { return Some(wrapper) };
    let unclassified = match (classified(argument(node, position)), &wrapper.unclassified_value) {
        (Classified::Absent, None) => true,
        (Classified::Text(found), Some(wanted)) => &found == wanted,
        _ => false,
    };
    unclassified.then_some(wrapper)
}
