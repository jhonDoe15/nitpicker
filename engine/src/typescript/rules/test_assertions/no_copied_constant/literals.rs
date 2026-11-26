//! What the rule reads from the test file: the literals that could copy a constant, the modules it loads and the
//! identifiers a statement mentions.
use super::module::Value;
use super::report::{is_trivial, js_number};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value as Field, View};

const PATH_CALLS: [&str; 5] = ["mock", "doMock", "unmock", "importActual", "requireActual"];
const TEST_FUNCTIONS: [&str; 4] = ["it", "test", "describe", "suite"];
const MORE_TEST_FUNCTIONS: [&str; 3] = ["context", "specify", "bench"];
const SKIPPING_PARENTS: [&str; 8] = [
    "ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "ImportExpression", "ImportAttribute",
    "TSLiteralType", "TSEnumMember", "TSExternalModuleReference",
];

/// A literal the rule may report: the node it reports (the negation when there is one) and its value.
pub struct Candidate<'v> {
    pub node: Node<'v>,
    pub value: Value,
}

/// A module the file loads, as `ModuleLoad`: the specifier, the names bound from it and whether it is taken whole.
pub struct Loaded {
    pub specifier: String,
    pub names: Vec<(String, Vec<String>)>,
    pub whole: bool,
}

fn bind(names: &mut Vec<(String, Vec<String>)>, imported: String, local: String) {
    match names.iter_mut().find(|(name, _)| *name == imported) {
        Some((_, locals)) => locals.push(local),
        None => names.push((imported, vec![local])),
    }
}

/// `literalText`.
fn literal_text(node: Option<Node>) -> Option<String> {
    let node = node?;
    match node.kind() {
        "Literal" => node.text("value").map(|text| text.into_owned()),
        "TemplateLiteral" if node.nodes("expressions").is_empty() => cooked(node),
        _ => None,
    }
}

fn cooked(template: Node) -> Option<String> {
    match template.nodes("quasis").first()?.get("value") {
        Field::Node(index) => template.view.at(index).text("cooked").map(|text| text.into_owned()),
        _ => None,
    }
}

/// `chainRootName`.
fn chain_root(node: Node) -> Option<String> {
    let mut current = node;
    loop {
        current = match current.kind() {
            "MemberExpression" => current.node("object")?,
            "CallExpression" => current.node("callee")?,
            "Identifier" => return current.name().map(|name| name.into_owned()),
            _ => return None,
        };
    }
}

fn first_argument_of<'v>(node: Node<'v>) -> Option<Node<'v>> {
    let call = node.parent().filter(|call| call.is("CallExpression"))?;
    (call.list("arguments").first() == Some(&Some(node))).then_some(call)
}

fn is_test_name(node: Node) -> bool {
    let Some(call) = first_argument_of(node) else { return false };
    let root = call.node("callee").and_then(chain_root);
    root.is_some_and(|root| TEST_FUNCTIONS.contains(&root.as_str()) || MORE_TEST_FUNCTIONS.contains(&root.as_str()))
}

fn is_path_argument(node: Node) -> bool {
    let Some(call) = first_argument_of(node) else {
        return node.parent().is_some_and(|parent| parent.is("ImportExpression"));
    };
    let Some(callee) = call.node("callee") else { return false };
    match callee.kind() {
        "Identifier" => callee.name().as_deref() == Some("require"),
        "MemberExpression" => callee.node("property").is_some_and(|property| {
            property.is("Identifier") && property.name().is_some_and(|name| PATH_CALLS.contains(&name.as_ref()))
        }),
        _ => false,
    }
}

fn is_skipped_position(node: Node) -> bool {
    let Some(parent) = node.parent() else { return false };
    let keyed = matches!(parent.kind(), "Property" | "PropertyDefinition" | "MethodDefinition")
        && parent.node("key") == Some(node)
        && !parent.flag("computed");
    SKIPPING_PARENTS.contains(&parent.kind())
        || keyed
        || (parent.is("ExpressionStatement") && matches!(parent.get("directive"), Field::Text(..)))
        || is_test_name(node)
        || is_path_argument(node)
}

fn candidate_of(node: Node) -> Option<Candidate> {
    if node.is("TemplateLiteral") {
        let text = node.nodes("expressions").is_empty().then(|| cooked(node).unwrap_or_default())?;
        return Some(Candidate { node, value: Value::Text(text) });
    }
    if node.has("bigint") || node.has("regex") {
        return None;
    }
    match node.get("value") {
        Field::Text(..) => Some(Candidate { node, value: Value::Text(node.text("value")?.into_owned()) }),
        Field::Number(number) => {
            let minus = |parent: &Node| parent.is("UnaryExpression") && parent.text("operator").as_deref() == Some("-");
            let negated = node.parent().filter(minus);
            Some(match negated {
                Some(parent) => Candidate { node: parent, value: Value::Number(-number) },
                None => Candidate { node, value: Value::Number(number) },
            })
        }
        _ => None,
    }
}

fn key_name(key: Node) -> String {
    if key.is("Identifier") {
        return key.name().map(|name| name.into_owned()).unwrap_or_default();
    }
    match key.get("value") {
        Field::Number(number) => js_number(number),
        Field::Bool(flag) => flag.to_string(),
        Field::Null => "null".to_string(),
        _ => key.text("value").map(|text| text.into_owned()).unwrap_or_else(|| "undefined".to_string()),
    }
}

/// `boundNames`: the names a destructuring of the loaded module binds.
fn bound_names(load: Node) -> Vec<(String, Vec<String>)> {
    let mut names = Vec::new();
    let holder = match load.parent() {
        Some(parent) if parent.is("AwaitExpression") => parent,
        _ => load,
    };
    let declarator = holder.parent().filter(|parent| parent.is("VariableDeclarator"));
    let Some(declarator) = declarator.filter(|declarator| declarator.node("init") == Some(holder)) else {
        return names;
    };
    let Some(pattern) = declarator.node("id").filter(|id| id.is("ObjectPattern")) else { return names };
    for property in pattern.nodes("properties") {
        if !property.is("Property") || property.flag("computed") {
            continue;
        }
        let local = property.node("value");
        let bound = match local {
            Some(local) if local.is("AssignmentPattern") => local.node("left"),
            other => other,
        };
        if let (Some(bound), Some(key)) = (bound.filter(|bound| bound.is("Identifier")), property.node("key")) {
            bind(&mut names, key_name(key), bound.name().map(|name| name.into_owned()).unwrap_or_default());
        }
    }
    names
}

fn loaded_by_call(node: Node, scopes: &Scopes) -> Option<Loaded> {
    let callee = node.node("callee")?;
    let is_require = callee.is("Identifier") && callee.name().as_deref() == Some("require");
    let is_actual = callee.is("MemberExpression")
        && callee.node("property").is_some_and(|property| {
            property.is("Identifier") && matches!(property.name().as_deref(), Some("requireActual" | "importActual"))
        });
    if !is_require && !is_actual {
        return None;
    }
    if is_require && scopes.variable_named(callee).is_some() {
        return None;
    }
    let specifier = literal_text(node.list("arguments").first().copied().flatten())?;
    let names = bound_names(node);
    Some(Loaded { specifier, whole: names.is_empty(), names })
}

fn loaded_by(node: Node, scopes: &Scopes) -> Option<Loaded> {
    match node.kind() {
        "ImportExpression" => {
            let specifier = literal_text(node.node("source"))?;
            let names = bound_names(node);
            Some(Loaded { specifier, whole: names.is_empty(), names })
        }
        "TSImportEqualsDeclaration" => {
            let reference = node.node("moduleReference").filter(|reference| reference.is("TSExternalModuleReference"))?;
            if node.text("importKind").as_deref() == Some("type") {
                return None;
            }
            Some(Loaded { specifier: literal_text(reference.node("expression"))?, names: Vec::new(), whole: true })
        }
        "CallExpression" => loaded_by_call(node, scopes),
        _ => None,
    }
}

/// `importedModule`.
fn imported(statement: Node) -> Option<Loaded> {
    let specifier = statement.node("source").and_then(|source| source.text("value"))?.into_owned();
    let specifiers = statement.nodes("specifiers");
    let mut names: Vec<(String, Vec<String>)> = Vec::new();
    let mut whole = specifiers.is_empty();
    for specifier in specifiers {
        let local = || {
            let name = specifier.node("local").and_then(|local| local.name());
            name.map(|name| name.into_owned()).unwrap_or_default()
        };
        match specifier.kind() {
            "ImportNamespaceSpecifier" => whole = true,
            "ImportDefaultSpecifier" => match names.iter_mut().find(|(name, _)| name == "default") {
                Some((_, locals)) => *locals = vec![local()],
                None => names.push(("default".to_string(), vec![local()])),
            },
            _ if specifier.text("importKind").as_deref() != Some("type") => {
                let imported = specifier.node("imported").map(key_name).unwrap_or_default();
                bind(&mut names, imported, local());
            }
            _ => {}
        }
    }
    Some(Loaded { specifier, names, whole })
}

/// The literals the rule looks at and the modules the file loads: imports first, then loads in source order.
pub fn collect<'v>(view: &'v View, scopes: &Scopes) -> (Vec<Candidate<'v>>, Vec<Loaded>) {
    let mut candidates = Vec::new();
    let mut loads: Vec<Loaded> = view
        .program()
        .nodes("body")
        .into_iter()
        .filter(|statement| {
            statement.is("ImportDeclaration") && statement.text("importKind").as_deref() != Some("type")
        })
        .filter_map(imported)
        .collect();
    for node in view.nodes() {
        if matches!(node.kind(), "Literal" | "TemplateLiteral") {
            let reportable = |found: &Candidate| !is_trivial(&found.value) && !is_skipped_position(found.node);
            candidates.extend(candidate_of(node).filter(reportable));
        } else {
            loads.extend(loaded_by(node, scopes));
        }
    }
    (candidates, loads)
}

fn is_statement(node: Node) -> bool {
    node.kind().ends_with("Statement")
        || node.kind().ends_with("Declaration")
        || node.parent().is_some_and(|parent| parent.is("ArrowFunctionExpression") && parent.node("body") == Some(node))
}

/// `statementOf`.
pub fn statement_of(node: Node) -> Node {
    let mut current = node;
    while !is_statement(current) {
        match current.parent() {
            Some(parent) => current = parent,
            None => break,
        }
    }
    current
}

/// Whether the compiler's parent of `node` is a property access: it is the name of a member access, or its object
/// when that is not wrapped in parentheses, which the compiler keeps as a node of their own.
fn in_property_access(node: &Node) -> bool {
    let Some(parent) = node.parent().filter(|parent| parent.is("MemberExpression") && !parent.flag("computed")) else {
        return false;
    };
    let same = |object: Node| object.start() == node.start() && object.end() == node.end();
    let object = parent.node("object").is_some_and(same);
    !object || parent.start() == node.start()
}

/// The identifier tokens of the file, in source order: the range each covers and its name. The compiler's tokenizer
/// calls a name a JSX identifier inside a JSX element when its parent is a property access.
pub fn identifier_tokens(view: &View) -> Vec<(u32, u32, String)> {
    let mut tokens: Vec<(u32, u32, String)> = view
        .nodes()
        .filter(|node| node.is("Identifier"))
        .filter(|node| {
            let in_jsx = || node.ancestors().any(|above| above.is("JSXElement") || above.is("JSXFragment"));
            !(in_property_access(node) && in_jsx())
        })
        .filter_map(|node| Some((node.start(), node.end(), node.name()?.into_owned())))
        .collect();
    tokens.sort();
    tokens
}
