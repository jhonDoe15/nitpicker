//! `no-unchecked-response-json`: `response.json()` on a `fetch` response before its status is checked.
use super::handlers::walk::name_of;
use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::{Def, DefKind, Scopes};
use crate::typescript::rules::support::view::Node;

const RULE: &str = "no-unchecked-response-json";
const BODY_READERS: [&str; 7] = ["json", "text", "blob", "arrayBuffer", "formData", "clone", "body"];
const FETCH_OWNERS: [&str; 3] = ["globalThis", "window", "self"];
const FUNCTIONS: [&str; 3] = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"];

fn message(name: &str) -> String {
    format!("`{name}.json()` runs before `{name}.ok` or the status is checked, so an HTML error page from a proxy fails as an opaque `SyntaxError` and the status is lost; check `{name}.ok` first, or read `{name}.text()` and parse it inside `try`.")
}

fn callee_name(callee: Node) -> Option<String> {
    if callee.is("Identifier") {
        return name_of(Some(callee));
    }
    (callee.is("MemberExpression") && !callee.flag("computed")).then(|| name_of(callee.node("property"))).flatten()
}

fn is_fetch_call(node: Option<Node>) -> bool {
    let Some(callee) = node.filter(|node| node.is("CallExpression")).and_then(|node| node.node("callee")) else { return false };
    if callee_name(callee).as_deref() != Some("fetch") {
        return false;
    }
    let owner = callee.node("object").filter(|object| callee.is("MemberExpression") && object.is("Identifier"));
    callee.is("Identifier") || name_of(owner).is_some_and(|owner| FETCH_OWNERS.contains(&owner.as_str()))
}

fn property_name(member: Node) -> Option<String> {
    member.node("property").filter(|property| property.is("Identifier") && !member.flag("computed")).and_then(|property| name_of(Some(property)))
}

fn is_then_callback_of_fetch(parameter: Node) -> bool {
    let Some(callback) = parameter.parent().filter(|callback| callback.is("ArrowFunctionExpression") || callback.is("FunctionExpression")) else { return false };
    let Some(call) = callback.parent().filter(|call| call.is("CallExpression")) else { return false };
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"));
    let then = callee.and_then(|callee| callee.node("property")).is_some_and(|property| property.is("Identifier") && name_of(Some(property)).as_deref() == Some("then"));
    callback.list("params").first().copied().flatten() == Some(parameter)
        && call.list("arguments").first().copied().flatten() == Some(callback)
        && then
        && is_fetch_call(callee.and_then(|callee| callee.node("object")))
}

fn is_response_origin(definition: &Def) -> bool {
    match definition.kind {
        DefKind::Variable if definition.node.is("VariableDeclarator") => {
            let init = definition.node.node("init");
            let value = init.map(|init| if init.is("AwaitExpression") { init.node("argument") } else { Some(init) }).flatten();
            definition.node.node("id") == Some(definition.name) && is_fetch_call(value)
        }
        DefKind::Parameter => definition.name.is("Identifier") && is_then_callback_of_fetch(definition.name),
        _ => false,
    }
}

fn is_in_try_with_catch(node: Node) -> bool {
    let mut child = node;
    while let Some(parent) = child.parent().filter(|parent| !parent.is("Program")) {
        if parent.is("TryStatement") && parent.node("block") == Some(child) && parent.node("handler").is_some() {
            return true;
        }
        if FUNCTIONS.contains(&parent.kind()) {
            return false;
        }
        child = parent;
    }
    false
}

fn is_caught(call: Node) -> bool {
    call.parent().is_some_and(|outer| {
        let property = outer.node("property").filter(|property| property.is("Identifier"));
        outer.is("MemberExpression") && outer.node("object") == Some(call) && name_of(property).as_deref() == Some("catch")
    })
}

fn is_plain_body_use(identifier: Node) -> bool {
    identifier.parent().is_some_and(|parent| {
        parent.is("MemberExpression") && parent.node("object") == Some(identifier) && property_name(parent).is_some_and(|name| BODY_READERS.contains(&name.as_str()))
    })
}

enum Target<'v> {
    Name(Node<'v>),
    Awaited,
}

fn json_read(node: Node) -> Option<Target> {
    let callee = node.node("callee").filter(|callee| callee.is("MemberExpression"))?;
    if property_name(callee).as_deref() != Some("json") || !node.list("arguments").is_empty() {
        return None;
    }
    let object = callee.node("object")?;
    if object.is("Identifier") {
        return Some(Target::Name(object));
    }
    (object.is("AwaitExpression") && is_fetch_call(object.node("argument"))).then_some(Target::Awaited)
}

/// A `typeof` in a type reads the value, as ESLint counts references.
fn in_type_query(identifier: Node) -> bool {
    let mut node = identifier;
    while let Some(parent) = node.parent().filter(|parent| parent.is("TSQualifiedName") && parent.node("left") == Some(node)) {
        node = parent;
    }
    node.parent().is_some_and(|parent| parent.is("TSTypeQuery") && parent.node("exprName") == Some(node))
}

/// Whether the call sits where ESLint's `getScope` gives a scope its references are not in: a switch
/// discriminant, a class decorator or a parameter decorator, whose references belong to the scope outside.
fn in_scope_header(call: Node) -> bool {
    let mut child = call;
    let mut decorated = false;
    for ancestor in call.ancestors() {
        decorated |= child.is("Decorator");
        match ancestor.kind() {
            "SwitchStatement" => return ancestor.node("discriminant") == Some(child),
            "ClassDeclaration" | "ClassExpression" => return ancestor.nodes("decorators").contains(&child),
            kind if FUNCTIONS.contains(&kind) => return decorated && ancestor.nodes("params").contains(&child),
            "BlockStatement" | "Program" | "StaticBlock" | "ForStatement" | "ForInStatement" | "ForOfStatement" | "CatchClause" | "TSModuleDeclaration" => return false,
            _ => child = ancestor,
        }
    }
    false
}

/// `import a = r.b;`: ESLint counts the root of the entity name as a read of `r`.
fn read_by_import_equals(scopes: &Scopes, view_node: Node, variable: oxc_semantic::SymbolId, before: u32) -> bool {
    view_node.view.nodes().filter(|node| node.is("TSImportEqualsDeclaration")).any(|declaration| {
        let mut root = declaration.node("moduleReference");
        while let Some(qualified) = root.filter(|root| root.is("TSQualifiedName")) {
            root = qualified.node("left");
        }
        root.filter(|root| root.is("Identifier") && root.start() < before).is_some_and(|root| {
            root.name().is_some_and(|name| scopes.variable_by_name(&name, root.start()) == Some(variable))
        })
    })
}

fn unchecked(scopes: &Scopes, node: Node, target: Node) -> bool {
    if in_scope_header(node) {
        return false;
    }
    let Some(variable) = scopes.variable_named(target) else { return false };
    let definitions = scopes.defs(variable);
    if !definitions.iter().any(is_response_origin) {
        return false;
    }
    if read_by_import_equals(scopes, node, variable, node.start()) {
        return false;
    }
    !scopes.references(variable).iter().any(|reference| {
        (reference.read || in_type_query(reference.identifier)) && reference.identifier != target && reference.identifier.start() < node.start() && !is_plain_body_use(reference.identifier)
    })
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("CallExpression")) {
        let Some(target) = json_read(node) else { continue };
        if is_caught(node) || is_in_try_with_catch(node) {
            continue;
        }
        let name = match target {
            Target::Awaited => "response".to_string(),
            Target::Name(target) if unchecked(scopes, node, target) => name_of(Some(target)).unwrap_or_default(),
            Target::Name(_) => continue,
        };
        found.push((node.start(), node.end(), message(&name)));
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
