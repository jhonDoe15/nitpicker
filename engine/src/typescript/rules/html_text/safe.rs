//! `safe-values.mts` of the ESLint plugin: whether a value put in HTML text is safe without escaping, by its name,
//! the call that makes it or the values written to it, five steps deep. Run without type information.
use super::parts::{fragment_of, is_markup};
use crate::typescript::rules::http_values::origins::counted_write;
use crate::typescript::rules::patterns::syntax::{callee_name_of, operands_of};
use crate::typescript::rules::security_values::leaves::{assigned_writes, declared_writes};
use crate::typescript::rules::security_values::{defs, resolve_constant, unwrapped, variable_of};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::string_value;
use regex::Regex;
use std::sync::LazyLock;

const NUMBER_CALLS: [&str; 5] = ["Number", "parseInt", "parseFloat", "toFixed", "toPrecision"];
const NUMBER_PROPERTIES: [&str; 3] = ["length", "size", "count"];
const MAX_DEPTH: usize = 5;

static SAFE_CALL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)escape|encode|sanitize|html|markup").expect("pattern"));
static SAFE_NAME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)html|markup|escaped|encoded|sanitized|safe|class|nonce|color|icon|attribute|tag$|css|children|rendered").expect("pattern")
});
static ENTITY: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)&(?:lt|gt|amp|quot|#[0-9]+|#x[0-9a-f]+);").expect("pattern"));

enum Verdict<'s> {
    Safe(bool),
    Next(Vec<Node<'s>>),
}

fn callee_name(call: Node) -> String {
    call.node("callee").and_then(callee_name_of).unwrap_or_default()
}

fn is_markup_fragment(node: Node) -> bool {
    fragment_of(node).is_some_and(|fragment| is_markup(&fragment.texts))
}

fn member_callee(call: Node) -> Option<Node> {
    call.node("callee").filter(|callee| callee.is("MemberExpression"))
}

fn is_mapped_join(call: Node) -> bool {
    let receiver = member_callee(call).and_then(|callee| callee.node("object"));
    callee_name(call) == "join" && receiver.is_some_and(|receiver| receiver.is("CallExpression") && callee_name(receiver) == "map")
}

fn is_entity_replace(call: Node) -> bool {
    ["replace", "replaceAll"].contains(&callee_name(call).as_str())
        && call.nodes("arguments").into_iter().any(|argument| ENTITY.is_match(&string_value(Some(argument)).unwrap_or_default()))
}

fn root_names(node: Node) -> Vec<String> {
    let mut names = Vec::new();
    let mut pending = vec![node];
    let mut at = 0;
    while at < pending.len() {
        let current = pending[at];
        at += 1;
        match current.kind() {
            "CallExpression" => {
                names.push(callee_name(current));
                pending.extend(current.node("callee"));
            }
            "AwaitExpression" => pending.extend(current.node("argument")),
            "MemberExpression" => pending.extend(current.node("object")),
            _ => {}
        }
    }
    names
}

fn owner_name(call: Node) -> String {
    let object = member_callee(call).and_then(|callee| callee.node("object")).filter(|object| object.is("Identifier"));
    object.and_then(|object| object.name()).map(|name| name.into_owned()).unwrap_or_default()
}

fn is_safe_join(call: Node) -> bool {
    member_callee(call).is_some() && callee_name(call) == "join" && SAFE_NAME.is_match(&owner_name(call))
}

fn safe_call(call: Node) -> bool {
    let name = callee_name(call);
    let owner = owner_name(call);
    root_names(call).iter().any(|root| SAFE_CALL.is_match(root))
        || SAFE_CALL.is_match(&owner)
        || NUMBER_CALLS.contains(&name.as_str())
        || is_mapped_join(call)
        || is_safe_join(call)
        || is_entity_replace(call)
        || owner == "Math"
}

/// `writeVerdict`: the values written to a name declared only as plain variables, when each write has one.
fn write_verdict<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Verdict<'s> {
    let Some(variable) = variable_of(scopes, node) else { return Verdict::Safe(false) };
    let definitions = defs(scopes, node);
    let declared = definitions.iter().all(|definition| definition.node.is("VariableDeclarator") && definition.node.node("id").is_some_and(|id| id.is("Identifier")));
    let names: Vec<Node> = definitions.iter().map(|definition| definition.name).collect();
    let writes: Vec<Node> = scopes
        .references(variable)
        .into_iter()
        .filter(|reference| counted_write(reference.identifier, reference.write, names.contains(&reference.identifier)))
        .map(|reference| reference.identifier)
        .collect();
    let mut written = Vec::new();
    for identifier in &writes {
        let values = if names.contains(identifier) { declared_writes(*identifier) } else { assigned_writes(*identifier) };
        if values.is_empty() {
            return Verdict::Safe(false);
        }
        written.extend(values);
    }
    if declared && !writes.is_empty() { Verdict::Next(written) } else { Verdict::Safe(false) }
}

fn chain_names(node: Node) -> Vec<String> {
    let mut names = Vec::new();
    let mut current = Some(node);
    while let Some(member) = current.filter(|member| member.is("MemberExpression")) {
        let property = member.node("property").filter(|property| !member.flag("computed") && property.is("Identifier"));
        names.extend(property.and_then(|property| property.name()).map(|name| name.into_owned()));
        current = member.node("object");
    }
    names
}

fn is_safe_member(target: Node) -> bool {
    let property = target.node("property").filter(|property| !target.flag("computed") && property.is("Identifier"));
    chain_names(target).iter().any(|name| SAFE_NAME.is_match(name))
        || property.and_then(|property| property.name()).is_some_and(|name| NUMBER_PROPERTIES.contains(&name.as_ref()))
}

fn compound_operands(target: Node) -> Option<Vec<Node>> {
    match target.kind() {
        "TemplateLiteral" => Some(if is_markup_fragment(target) { Vec::new() } else { target.nodes("expressions") }),
        "BinaryExpression" => {
            let plus = target.text("operator").as_deref() == Some("+");
            Some(if !plus || is_markup_fragment(target) { Vec::new() } else { operands_of(target, "+") })
        }
        "ConditionalExpression" => Some(target.node("consequent").into_iter().chain(target.node("alternate")).collect()),
        "LogicalExpression" => Some(target.node("left").into_iter().chain(target.node("right")).collect()),
        _ => None,
    }
}

fn leaf_verdict<'s>(scopes: &Scopes<'_, 's>, target: Node<'s>) -> Verdict<'s> {
    match target.kind() {
        "Identifier" if target.name().is_some_and(|name| SAFE_NAME.is_match(&name)) => Verdict::Safe(true),
        "Identifier" => write_verdict(scopes, target),
        "MemberExpression" => Verdict::Safe(is_safe_member(target)),
        "CallExpression" => Verdict::Safe(safe_call(target)),
        kind => Verdict::Safe(kind == "UnaryExpression"),
    }
}

fn verdict_of<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>, depth: usize) -> Verdict<'s> {
    let named = unwrapped(node);
    if named.is("Identifier") && named.name().is_some_and(|name| SAFE_NAME.is_match(&name)) {
        return Verdict::Safe(true);
    }
    let Some(target) = resolve_constant(scopes, Some(named)).map(unwrapped).filter(|_| depth <= MAX_DEPTH) else { return Verdict::Safe(false) };
    if target.is("Literal") || string_value(Some(target)).is_some() {
        return Verdict::Safe(true);
    }
    compound_operands(target).map_or_else(|| leaf_verdict(scopes, target), Verdict::Next)
}

/// `isSafeValue`, without type information.
pub fn is_safe_value<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> bool {
    let mut pending = vec![(node, 0)];
    let mut at = 0;
    while at < pending.len() {
        let (current, depth) = pending[at];
        at += 1;
        match verdict_of(scopes, current, depth) {
            Verdict::Safe(false) => return false,
            Verdict::Safe(true) => {}
            Verdict::Next(children) => pending.extend(children.into_iter().map(|child| (child, depth + 1))),
        }
    }
    true
}
