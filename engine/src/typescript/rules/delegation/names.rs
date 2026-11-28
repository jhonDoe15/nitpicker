//! `enclosing-names.mts`: the names a function is known by, and which functions are hooks or accessors.
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::sync::LazyLock;

const LIFECYCLE_HOOKS: &[&str] = &[
    "componentDidMount",
    "componentDidUpdate",
    "componentWillUnmount",
    "ngOnInit",
    "ngOnDestroy",
    "ngOnChanges",
    "ngAfterViewInit",
    "ngDoCheck",
];

static HANDLER_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new("^(?:on|handle)[A-Z]").expect("pattern"));

pub fn is_hook_name(name: &str) -> bool {
    LIFECYCLE_HOOKS.contains(&name) || HANDLER_NAME.is_match(name)
}

pub fn string_literal(node: Node) -> Option<String> {
    if node.is("Literal") { node.text("value").map(|text| text.into_owned()) } else { None }
}

fn key_name(key: Node, computed: bool) -> Option<String> {
    if computed {
        return None;
    }
    if key.is("Identifier") {
        return key.name().map(|name| name.into_owned());
    }
    string_literal(key)
}

fn assigned_name(left: Node) -> Option<String> {
    if left.is("Identifier") {
        return left.name().map(|name| name.into_owned());
    }
    let property = left.node("property")?;
    if left.is("MemberExpression") { key_name(property, left.flag("computed")) } else { None }
}

fn member_binding(function: Node, parent: Node) -> Option<String> {
    let key = |parent: Node| key_name(parent.node("key")?, parent.flag("computed"));
    let owns = parent.node("value") == Some(function);
    match parent.kind() {
        "MethodDefinition" => (parent.text("kind").as_deref() == Some("method") && owns).then(|| key(parent)).flatten(),
        "Property" => (owns && parent.text("kind").as_deref() == Some("init")).then(|| key(parent)).flatten(),
        "PropertyDefinition" => owns.then(|| key(parent)).flatten(),
        _ => None,
    }
}

fn binding_name(function: Node) -> Option<String> {
    let parent = function.parent()?;
    match parent.kind() {
        "AssignmentExpression" => {
            let assigned = parent.node("right") == Some(function);
            assigned.then(|| assigned_name(parent.node("left")?)).flatten()
        }
        "VariableDeclarator" => {
            let id = parent.node("id").filter(|id| id.is("Identifier"))?;
            (parent.node("init") == Some(function)).then(|| id.name().map(|name| name.into_owned())).flatten()
        }
        _ => member_binding(function, parent),
    }
}

pub fn enclosing_names(function: Node) -> Vec<String> {
    let own = if function.is("ArrowFunctionExpression") { None } else { function.node("id").and_then(|id| id.name()) };
    own.map(|name| name.into_owned()).into_iter().chain(binding_name(function)).collect()
}

pub fn is_accessor_or_constructor(function: Node) -> bool {
    let Some(parent) = function.parent() else { return false };
    match parent.kind() {
        "MethodDefinition" => parent.text("kind").as_deref() != Some("method"),
        "Property" => parent.text("kind").as_deref() != Some("init"),
        _ => false,
    }
}
