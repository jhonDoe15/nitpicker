//! `temp-path-parts.mts` and the path helpers of `time-values.mts`: what a path is built from, followed through
//! joins, concatenations, templates and `const` names.
use crate::typescript::rules::signatures::{ASSERTION_FORMS, unwrap};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};

const MAX_DEPTH: usize = 8;
const PATH_JOINS: [&str; 2] = ["join", "resolve"];
const FUNCTIONS: [&str; 5] = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "TSDeclareFunction", "TSEmptyBodyFunctionExpression"];

#[derive(Clone, Copy, Default)]
pub struct PathParts {
    pub under_temp: bool,
    pub process_id: bool,
    pub parameter: bool,
}

enum Expansion<'v> {
    Leaf(Option<PathParts>),
    Children(Vec<Node<'v>>),
}

pub fn name_of(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

/// `calleeName`.
pub fn callee_name(callee: Option<Node>) -> String {
    let Some(callee) = callee else { return String::new() };
    if callee.is("Identifier") {
        return name_of(Some(callee)).unwrap_or_default();
    }
    if callee.is("MemberExpression") && !callee.flag("computed") { name_of(callee.node("property")).unwrap_or_default() } else { String::new() }
}

/// `isJoin`: a `join(...)` or `resolve(...)` call, of `path` or of any object.
pub fn is_join(node: Node) -> bool {
    let Some(callee) = node.node("callee").filter(|_| node.is("CallExpression")) else { return false };
    let name = if callee.is("MemberExpression") { name_of(callee.node("property")) } else { name_of(Some(callee)) };
    name.is_some_and(|name| PATH_JOINS.contains(&name.as_str()))
}

fn is_tmpdir_call(node: Node) -> bool {
    let Some(callee) = node.node("callee").filter(|_| node.is("CallExpression")) else { return false };
    name_of(Some(callee)).as_deref() == Some("tmpdir") || (callee.is("MemberExpression") && name_of(callee.node("property")).as_deref() == Some("tmpdir"))
}

fn is_process_id(node: Option<Node>) -> bool {
    node.is_some_and(|node| {
        node.is("MemberExpression")
            && !node.flag("computed")
            && name_of(node.node("object")).as_deref() == Some("process")
            && name_of(node.node("property")).as_deref() == Some("pid")
    })
}

fn text_parts(text: &str) -> PathParts {
    let under_temp = text.strip_prefix("/tmp").is_some_and(|rest| rest.is_empty() || rest.starts_with('/'));
    PathParts { under_temp, ..PathParts::default() }
}

fn literal_parts(node: Node) -> Option<PathParts> {
    match node.get("value") {
        Value::Text(..) => Some(text_parts(&node.text("value").unwrap_or_default())),
        Value::Number(_) if node.get("bigint") == Value::Null => Some(PathParts::default()),
        _ => None,
    }
}

fn call_parts(node: Node) -> Expansion {
    if is_tmpdir_call(node) {
        return Expansion::Leaf(Some(PathParts { under_temp: true, ..PathParts::default() }));
    }
    let arguments = node.nodes("arguments");
    if is_join(node) {
        return Expansion::Children(arguments);
    }
    let callee = node.node("callee");
    if name_of(callee).as_deref() == Some("String") && arguments.len() == 1 {
        return Expansion::Children(arguments);
    }
    let process_id = callee.is_some_and(|callee| {
        callee.is("MemberExpression") && name_of(callee.node("property")).as_deref() == Some("toString") && is_process_id(callee.node("object"))
    });
    Expansion::Leaf((process_id && arguments.is_empty()).then_some(PathParts { process_id: true, ..PathParts::default() }))
}

fn identifier_parts<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Expansion<'s> {
    let symbol = super::super::find_variable(scopes, node);
    let defs = symbol.map(|symbol| scopes.defs(symbol)).unwrap_or_default();
    let [definition] = defs.as_slice() else { return Expansion::Leaf(None) };
    if definition.kind == DefKind::Parameter {
        let mut holders = definition.name.ancestors().take_while(|holder| !FUNCTIONS.contains(&holder.kind()));
        let defaulted = holders.any(|holder| holder.is("AssignmentPattern") && holder.node("left").is_some_and(|left| left.contains(definition.name)));
        let read_only = symbol.is_some_and(|symbol| scopes.references(symbol).iter().all(|reference| super::super::is_read(reference) && !super::super::is_write(reference)));
        let read_only = read_only && !defaulted;
        return Expansion::Leaf(read_only.then_some(PathParts { parameter: true, ..PathParts::default() }));
    }
    let constant = definition.kind == DefKind::Variable
        && definition.node.parent().and_then(|declaration| declaration.text("kind")).as_deref() == Some("const")
        && definition.node.node("id").is_some_and(|id| id.is("Identifier"));
    match definition.node.node("init").filter(|_| constant) {
        Some(init) => Expansion::Children(vec![init]),
        None => Expansion::Leaf(None),
    }
}

fn expansion_of<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Expansion<'s> {
    if is_process_id(Some(node)) {
        return Expansion::Leaf(Some(PathParts { process_id: true, ..PathParts::default() }));
    }
    match node.kind() {
        "Literal" => Expansion::Leaf(literal_parts(node)),
        "TemplateElement" => {
            let cooked = match node.get("value") {
                Value::Node(at) => node.view.at(at).text("cooked").map(|cooked| cooked.into_owned()),
                _ => None,
            };
            Expansion::Leaf(Some(text_parts(&cooked.unwrap_or_default())))
        }
        "TemplateLiteral" => Expansion::Children(node.nodes("quasis").into_iter().take(1).chain(node.nodes("expressions")).collect()),
        "BinaryExpression" if node.text("operator").as_deref() == Some("+") => Expansion::Children([node.node("left"), node.node("right")].into_iter().flatten().collect()),
        "CallExpression" => call_parts(node),
        "Identifier" => identifier_parts(scopes, node),
        _ => Expansion::Leaf(None),
    }
}

/// `pathParts`, `None` when a part is unknown.
pub fn path_parts(scopes: &Scopes, start: Node) -> Option<PathParts> {
    let mut pending = vec![(start, 0)];
    let mut merged = PathParts::default();
    let mut index = 0;
    while index < pending.len() {
        let (node, depth) = pending[index];
        index += 1;
        let expansion = if depth > MAX_DEPTH { Expansion::Leaf(None) } else { expansion_of(scopes, unwrap(node, ASSERTION_FORMS)) };
        match expansion {
            Expansion::Children(children) => pending.extend(children.into_iter().map(|child| (child, depth + 1))),
            Expansion::Leaf(None) => return None,
            Expansion::Leaf(Some(parts)) => {
                merged.under_temp |= parts.under_temp;
                merged.process_id |= parts.process_id;
                merged.parameter |= parts.parameter;
            }
        }
    }
    Some(merged)
}

/// `isSharedTempPath`.
pub fn is_shared_temp_path(parts: Option<PathParts>) -> Option<PathParts> {
    parts.filter(|parts| parts.under_temp && (!parts.parameter || parts.process_id))
}
