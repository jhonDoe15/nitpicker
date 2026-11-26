//! Copies a function makes of a parameter before it changes it, writes to a variable and where they stand, and
//! the parameters that are meant to be filled in place.
use super::{Scope, callee_name, is_function, name_of, static_member_name};
use crate::typescript::rules::support::scope::DefKind;
use crate::typescript::rules::support::view::Node;
use oxc_semantic::SymbolId;
use regex::Regex;
use std::sync::LazyLock;

const COPY_METHODS: &[&str] = &["slice", "concat", "toSorted", "toReversed", "toSpliced", "with", "map", "filter", "flat", "flatMap"];
const COPY_CONSTRUCTORS: &[&str] = &["Set", "Map", "Array"];
const COPY_FUNCTIONS: &[&str] = &["structuredClone", "from"];
const FRESH_CONTAINERS: &[&str] = &["Set", "Map"];
const LOOPS: &[&str] = &["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"];
const PATTERNS: &[&str] = &["ArrayPattern", "ObjectPattern", "RestElement"];

static CONTEXT_NAME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new("^(?:out|acc|accumulator|state|ctx|context|cache|builder|draft|results?|errors|diagnostics)$|(?:State|Context|Cache|Builder)$")
        .expect("pattern")
});
static FILLING_FUNCTION: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)^(?:resolve|normali[sz]e|sanitize|apply|fill)").expect("pattern"));
static OPTION_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new("^(?:config|options|opts)$").expect("pattern"));

/// A write reference of ESLint's scope manager: where it writes, whether it initializes the variable, and the
/// values it writes (the value written to the whole pattern and every default on the way to the name).
pub struct Write<'v> {
    pub identifier: Node<'v>,
    pub init: bool,
    pub values: Vec<Node<'v>>,
}

fn written_values(identifier: Node) -> Vec<Node> {
    let mut values = Vec::new();
    let mut current = identifier;
    while let Some(parent) = current.parent() {
        if parent.is("AssignmentPattern") && parent.node("left") == Some(current) {
            values.extend(parent.node("right"));
        } else if !(PATTERNS.contains(&parent.kind()) || (parent.is("Property") && parent.parent().is_some_and(|outer| outer.is("ObjectPattern")))) {
            break;
        }
        current = parent;
    }
    let Some(owner) = current.parent() else { return values };
    let whole = match owner.kind() {
        "VariableDeclarator" if owner.node("id") == Some(current) => owner.node("init").or_else(|| {
            let statement = owner.parent()?.parent()?;
            matches!(statement.kind(), "ForInStatement" | "ForOfStatement").then(|| statement.node("right")).flatten()
        }),
        "AssignmentExpression" if owner.node("left") == Some(current) => owner.node("right"),
        "ForInStatement" | "ForOfStatement" if owner.node("left") == Some(current) => owner.node("right"),
        _ => None,
    };
    whole.into_iter().chain(values).collect()
}

/// `variable.references` that write, with a parameter's defaults as writes that initialize it.
pub fn writes<'v>(scope: &Scope<'_, '_, 'v>, symbol: SymbolId) -> Vec<Write<'v>> {
    let definitions = scope.scopes.defs(symbol);
    let mut found: Vec<Write> = scope
        .scopes
        .references(symbol)
        .into_iter()
        .filter(|reference| reference.write)
        .map(|reference| {
            let init = definitions.iter().any(|definition| definition.kind == DefKind::Variable && definition.name == reference.identifier);
            Write { identifier: reference.identifier, init, values: written_values(reference.identifier) }
        })
        .collect();
    for definition in definitions.iter().filter(|definition| definition.kind == DefKind::Parameter) {
        let values = written_values(definition.name);
        if !values.is_empty() {
            found.push(Write { identifier: definition.name, init: true, values });
        }
    }
    found
}

pub fn is_object_assign(call: Node) -> bool {
    static_member_name(call, "Object").as_deref() == Some("assign")
}

pub fn is_object_define(call: Node) -> bool {
    matches!(static_member_name(call, "Object").as_deref(), Some("defineProperty" | "defineProperties"))
}

fn is_new_of(node: Node, names: &[&str]) -> bool {
    node.is("NewExpression") && node.node("callee").is_some_and(|callee| callee.is("Identifier") && names.contains(&callee.name().as_deref().unwrap_or("")))
}

pub fn is_fresh_container(node: Node) -> bool {
    (node.is("ArrayExpression") && node.list("elements").is_empty())
        || (node.is("ObjectExpression") && node.list("properties").is_empty())
        || (is_new_of(node, FRESH_CONTAINERS) && node.list("arguments").is_empty())
}

fn is_copy(node: Node) -> bool {
    match node.kind() {
        "ArrayExpression" => node.nodes("elements").iter().any(|element| element.is("SpreadElement")),
        "ObjectExpression" => node.nodes("properties").iter().any(|property| property.is("SpreadElement")),
        "NewExpression" => is_new_of(node, COPY_CONSTRUCTORS),
        "CallExpression" if is_object_assign(node) => node.list("arguments").first().copied().flatten().is_some_and(|first| first.is("ObjectExpression")),
        "CallExpression" => callee_name(node).is_some_and(|name| COPY_METHODS.contains(&name.as_str()) || COPY_FUNCTIONS.contains(&name.as_str())),
        _ => false,
    }
}

pub fn is_reassigned_to_copy(scope: &Scope, symbol: SymbolId, mutation: Node) -> bool {
    writes(scope, symbol).iter().any(|write| write.identifier.start() < mutation.start() && write.values.iter().any(|value| is_copy(*value)))
}

fn type_name(name: Node) -> Option<String> {
    let annotation = name.node("typeAnnotation")?.node("typeAnnotation")?;
    let type_name = annotation.node("typeName")?;
    (annotation.is("TSTypeReference") && type_name.is("Identifier")).then(|| name_of(Some(type_name))).flatten()
}

pub fn is_context_parameter(name: Node) -> bool {
    let written = if name.is("Identifier") { name_of(Some(name)).unwrap_or_default() } else { String::new() };
    CONTEXT_NAME.is_match(&written) || CONTEXT_NAME.is_match(&type_name(name).unwrap_or_default())
}

fn owner_name(owner: Node) -> Option<String> {
    if owner.is("FunctionDeclaration") {
        return name_of(owner.node("id"));
    }
    let holder = owner.parent()?;
    let id = holder.node("id")?;
    (holder.is("VariableDeclarator") && id.is("Identifier")).then(|| name_of(Some(id))).flatten()
}

fn root_name(node: Node) -> Option<String> {
    let mut current = node;
    while current.is("MemberExpression") {
        current = current.node("object")?;
    }
    current.is("Identifier").then(|| name_of(Some(current))).flatten()
}

pub fn is_default_fill(node: Node, parameter: Node, owner: Node) -> bool {
    if !node.is("AssignmentExpression") || !matches!(node.text("operator").as_deref(), Some("??=" | "||=")) {
        return false;
    }
    let parameter_name = if parameter.is("Identifier") { name_of(Some(parameter)).unwrap_or_default() } else { String::new() };
    let names = [node.node("left").and_then(root_name).unwrap_or_default(), parameter_name];
    names.iter().any(|name| OPTION_NAME.is_match(name)) && FILLING_FUNCTION.is_match(&owner_name(owner).unwrap_or_default())
}

pub fn is_reassigned_from_call(call: Node, argument: Node) -> bool {
    let Some(holder) = call.parent() else { return false };
    let left = holder.node("left");
    holder.is("AssignmentExpression")
        && holder.node("right") == Some(call)
        && left.is_some_and(|left| left.is("Identifier"))
        && argument.is("Identifier")
        && name_of(left) == name_of(Some(argument))
}

fn in_different_arms(write: Node, mutation: Node) -> bool {
    write.ancestors().any(|ancestor| {
        let (Some(consequent), Some(alternate)) = (ancestor.node("consequent"), ancestor.node("alternate")) else { return false };
        ancestor.is("IfStatement")
            && ((consequent.contains(write) && alternate.contains(mutation)) || (alternate.contains(write) && consequent.contains(mutation)))
    })
}

fn shares_loop(write: Node, mutation: Node) -> bool {
    write.ancestors().any(|ancestor| LOOPS.contains(&ancestor.kind()) && ancestor.contains(mutation))
}

/// `isOffPath`: the write cannot run before the change on the way to it.
pub fn is_off_path(write: Node, mutation: Node) -> bool {
    if in_different_arms(write, mutation) {
        return !shares_loop(write, mutation);
    }
    write.start() > mutation.end() && !shares_loop(write, mutation)
}

