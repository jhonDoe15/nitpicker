//! A `Map` read by `get`, the value type it yields, and the `set` calls that store under the same key.
use super::Facts;
use super::conditions::unwrapped;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::types::server::Type;

const MAPS: [&str; 3] = ["Map", "WeakMap", "ReadonlyMap"];

pub struct Lookup<'s> {
    pub receiver: Node<'s>,
    pub key: Node<'s>,
    pub value_type: Type,
}

pub fn method_call<'s>(node: Node<'s>, name: &str) -> Option<Node<'s>> {
    let call = unwrapped(node);
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression") && !callee.flag("computed"))?;
    let first = call.nodes("arguments").first().copied();
    (call.is("CallExpression")
        && callee.node("property").and_then(|property| property.name()).as_deref() == Some(name)
        && first.is_some_and(|first| !first.is("SpreadElement")))
    .then_some(call)
}

impl<'s> Facts<'_, '_, 's> {
    fn map_value_type(&self, receiver: Node) -> Option<Type> {
        let mut types = self.types.borrow_mut();
        let Some(found) = types.type_at(receiver.start(), receiver.end()) else {
            types.refuse("no type for a map receiver");
            return None;
        };
        let kind = types.non_nullable(&found)?;
        let symbol = types.symbol(&kind)?;
        if !MAPS.contains(&symbol.name.as_str()) || !crate::typescript::rules::typed::types::Types::is_reference(&kind) {
            return None;
        }
        types.type_arguments(&kind).get(1).cloned()
    }

    pub fn lookup_of(&self, node: Node<'s>) -> Option<Lookup<'s>> {
        let call = method_call(node, "get")?;
        let arguments = call.nodes("arguments");
        if arguments.len() != 1 {
            return None;
        }
        let receiver = call.node("callee")?.node("object")?;
        let value_type = self.map_value_type(receiver)?;
        Some(Lookup { receiver, key: arguments[0], value_type })
    }

    pub fn bound_lookup(&self, node: Node<'s>) -> Option<Lookup<'s>> {
        let target = unwrapped(node);
        if !target.is("Identifier") {
            return self.lookup_of(target);
        }
        let symbol = self.scopes.variable_named(target)?;
        let declarator = self.scopes.defs(symbol).into_iter().next()?.node;
        let init = declarator.node("init").filter(|_| declarator.is("VariableDeclarator"))?;
        self.lookup_of(init)
    }

    pub fn store_calls(&self, region: &[Node<'s>], lookup: &Lookup<'s>) -> Vec<Node<'s>> {
        let receiver = self.plain_text(lookup.receiver);
        let key = self.plain_text(lookup.key);
        let is_store = |call: &Node<'s>| {
            let object = call.node("callee").and_then(|callee| callee.node("object"));
            let first = call.nodes("arguments").first().copied().unwrap_or(*call);
            object.is_some_and(|object| self.plain_text(object) == receiver) && self.plain_text(first) == key
        };
        let candidates = region.iter().flat_map(|root| root.descendants());
        candidates.filter(|candidate| method_call(*candidate, "set") == Some(*candidate) && is_store(candidate)).collect()
    }
}

const NON_EMPTY_CALLS: [&str; 9] = ["emitFile", "randomUUID", "uuid", "nanoid", "createHash", "digest", "hash", "toISOString", "stringify"];

fn has_cooked_text(template: Node) -> bool {
    template.nodes("quasis").into_iter().any(|quasi| match quasi.get("value") {
        Value::Node(index) => quasi.view.at(index).text("cooked").is_some_and(|cooked| !cooked.is_empty()),
        _ => false,
    })
}

fn is_non_empty_text(node: Node) -> bool {
    if node.is("TemplateLiteral") {
        return has_cooked_text(node);
    }
    node.is("Literal") && node.text("value").is_some_and(|value| !value.is_empty())
}

fn is_non_empty_leaf(target: Node) -> bool {
    match target.kind() {
        "Literal" => is_non_empty_text(target) || matches!(target.get("value"), Value::Number(number) if number != 0.0),
        "TemplateLiteral" => is_non_empty_text(target),
        "BinaryExpression" => {
            target.text("operator").as_deref() == Some("+")
                && ["left", "right"].iter().any(|side| target.node(side).is_some_and(is_non_empty_text))
        }
        "CallExpression" => {
            let Some(callee) = target.node("callee") else { return false };
            let named = if callee.is("MemberExpression") { callee.node("property") } else { Some(callee) };
            named.and_then(|named| named.name()).is_some_and(|name| NON_EMPTY_CALLS.contains(&name.as_ref()))
        }
        _ => false,
    }
}

fn is_non_empty(node: Node) -> bool {
    let mut pending = vec![node];
    let mut index = 0;
    while index < pending.len() {
        let target = unwrapped(pending[index]);
        index += 1;
        if target.is("ConditionalExpression") {
            pending.extend(["consequent", "alternate"].iter().filter_map(|side| target.node(side)));
        } else if !is_non_empty_leaf(target) {
            return false;
        }
    }
    true
}

fn assigned_to<'s>(name: &str, region: &[Node<'s>]) -> Vec<Node<'s>> {
    let assignment = |node: &Node<'s>| {
        node.is("AssignmentExpression")
            && node.text("operator").as_deref() == Some("=")
            && node.node("left").is_some_and(|left| left.is("Identifier") && left.name().as_deref() == Some(name))
    };
    region.iter().flat_map(|root| root.descendants()).filter(assignment).filter_map(|node| node.node("right")).collect()
}

fn possible_values<'s>(value: Node<'s>, region: &[Node<'s>]) -> Vec<Node<'s>> {
    let target = unwrapped(value);
    let assigned = if target.is("Identifier") { assigned_to(&target.name().unwrap_or_default(), region) } else { Vec::new() };
    if assigned.is_empty() { vec![target] } else { assigned }
}

pub fn only_stores_non_empty<'s>(stores: &[Node<'s>], region: &[Node<'s>]) -> bool {
    let values: Vec<Option<Node>> = stores.iter().map(|call| call.nodes("arguments").get(1).copied()).collect();
    !values.is_empty()
        && values.iter().all(|value| value.is_some_and(|value| !value.is("SpreadElement") && possible_values(value, region).into_iter().all(is_non_empty)))
}
