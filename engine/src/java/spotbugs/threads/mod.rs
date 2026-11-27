//! Patterns about code that threads share: SharedVariableAtomicityDetector's AT_STALE_THREAD_WRITE_OF_PRIMITIVE,
//! AT_NONATOMIC_64BIT_PRIMITIVE and AT_NONATOMIC_OPERATIONS_ON_SHARED_VARIABLE.
//!
//! SpotBugs looks at one class file at a time: methods only (constructors, initializers and lambda bodies never count),
//! and only fields the class declares itself. Code counts as locked inside a `synchronized` method or block, where a
//! lock is held (`locks.rs`), and in a private method whose every call in the class's own methods is made from locked
//! code, a constructor or a lambda; a private method nothing calls counts as locked too.
mod atomicity;
mod locks;
mod order;
mod uses;

use super::Context;
use super::fields::field_key;
use super::statements::member_label;
use crate::engine::source::{children, parent};
use crate::java::helpers::has_modifier;
use crate::java::types::scope::TYPE_DECLARATIONS;
use crate::java::types::model::Type;
use std::collections::HashSet;
use tree_sitter::Node;

pub const PATTERNS: &[&str] = &["AT_STALE_THREAD_WRITE_OF_PRIMITIVE", "AT_NONATOMIC_64BIT_PRIMITIVE", "AT_NONATOMIC_OPERATIONS_ON_SHARED_VARIABLE"];

/// One method of the class, with the code that is its own.
pub struct Method<'a> {
    pub declaration: Node<'a>,
    pub nodes: Vec<Node<'a>>,
    held: locks::Held,
    synchronized: bool,
}

/// Every node of a member's code outside lambdas and classes declared inside.
fn own_nodes<'t>(node: Node<'t>, out: &mut Vec<Node<'t>>) {
    for part in children(node) {
        if part.kind() == "class_body" || part.kind() == "lambda_expression" || TYPE_DECLARATIONS.contains(&part.kind()) {
            continue;
        }
        out.push(part);
        own_nodes(part, out);
    }
}

fn in_monitor(node: Node, member: Node) -> bool {
    let mut current = parent(node);
    while let Some(holder) = current {
        if holder.id() == member.id() {
            return false;
        }
        if holder.kind() == "synchronized_statement" && holder.child_by_field_name("body").is_some_and(|body| body.start_byte() <= node.start_byte()) {
            return true;
        }
        current = parent(holder);
    }
    false
}

impl Method<'_> {
    fn locked_at(&self, node: Node, locked: &HashSet<usize>) -> bool {
        self.synchronized || locked.contains(&self.declaration.id()) || in_monitor(node, self.declaration) || self.held.held(node)
    }
}

/// A `synchronized` method, or one Lombok's `@Synchronized` wraps in a `synchronized` block.
pub fn synchronized(context: &Context, method: Node) -> bool {
    has_modifier(method, "synchronized") || super::lombok::annotated(context, method, "Synchronized")
}

/// The erased type of a parameter, an array for `T...`.
fn parameter_type(context: &Context, parameter: Node) -> Option<Type> {
    let written = context.resolver.type_node(parameter.child_by_field_name("type")?)?.erased();
    Some(if parameter.kind() == "spread_parameter" { Type::Array(Box::new(written)) } else { written })
}

/// The private methods SpotBugs takes for locked: those whose every call from the class's methods is locked.
fn locked_private<'a>(context: &Context<'a>, own: &str, methods: &[Method<'a>]) -> HashSet<usize> {
    let private: Vec<(String, Vec<Option<Type>>, usize)> = methods
        .iter()
        .filter(|method| has_modifier(method.declaration, "private"))
        .filter_map(|method| {
            let name = method.declaration.child_by_field_name("name")?;
            let parameters = method.declaration.child_by_field_name("parameters").map(children).unwrap_or_default();
            let types = parameters.into_iter().filter(|part| part.kind().ends_with("parameter")).map(|part| parameter_type(context, part)).collect();
            Some((context.text(name).to_string(), types, method.declaration.id()))
        })
        .collect();
    let names: HashSet<&str> = private.iter().map(|(name, _, _)| name.as_str()).collect();
    let mut calls: Vec<(usize, usize, Node)> = Vec::new();
    for (at, method) in methods.iter().enumerate() {
        let named = |node: &Node| node.child_by_field_name("name").is_some_and(|name| names.contains(context.text(name)));
        for node in method.nodes.iter().filter(|node| node.kind() == "method_invocation" && named(node)) {
            let Some(call) = context.resolver.resolve_call(*node) else { continue };
            if call.declaring != own {
                continue;
            }
            let fits: Vec<&(String, Vec<Option<Type>>, usize)> = private.iter().filter(|(name, types, _)| *name == call.method.name && types.len() == call.method.parameters.len()).collect();
            let exact = fits.iter().find(|(_, types, _)| types.iter().zip(&call.method.parameters).all(|(own, called)| own.as_ref() == Some(&called.erased())));
            if let Some((_, _, callee)) = exact.or(fits.first().filter(|_| fits.len() == 1)) {
                calls.push((at, *callee, *node));
            }
        }
    }
    let mut locked: HashSet<usize> = private.iter().map(|(_, _, id)| *id).collect();
    loop {
        let open: Vec<usize> = calls.iter().filter(|(at, callee, node)| locked.contains(callee) && !methods[*at].locked_at(*node, &locked)).map(|(_, callee, _)| *callee).collect();
        if open.is_empty() {
            return locked;
        }
        for callee in open {
            locked.remove(&callee);
        }
    }
}

pub fn threads<'a>(context: &Context<'a>, class: Node<'a>) {
    if !context.wants(PATTERNS) {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { return };
    let Some(body) = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body")) else { return };
    let members = super::place::members(body);
    if !uses::threaded(context, &own, &members) {
        return;
    }
    let mut methods = Vec::new();
    for member in members.iter().filter(|member| member.kind() == "method_declaration") {
        let Some(code) = member.child_by_field_name("body").filter(|_| member_label(context, &own, class, *member).is_some()) else { continue };
        let mut nodes = Vec::new();
        own_nodes(code, &mut nodes);
        methods.push(Method { declaration: *member, nodes, held: locks::Held::of(context, code), synchronized: synchronized(context, *member) });
    }
    let locked = locked_private(context, &own, &methods);
    atomicity::report(context, &own, &methods, &|method: &Method, node| method.locked_at(node, &locked));
}

/// The field of the class itself that a name or `object.name` expression stands for.
pub fn own_field(context: &Context, own: &str, node: Node) -> Option<(String, String)> {
    field_key(context, crate::java::types::expr::unwrap(node)).filter(|(class, _)| class == own)
}
