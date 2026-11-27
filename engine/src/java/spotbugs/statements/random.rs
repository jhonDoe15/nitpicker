//! PREDICTABLE_RANDOM: a generator whose numbers can be guessed. SpotBugs reports every call that builds a
//! `java.util.Random`, including the constructor of a class that extends it, and every `ThreadLocalRandom.current()`
//! and `Math.random()`. It has no method label, so code in lambdas counts too.
use super::super::Context;
use crate::engine::source::children;
use tree_sitter::Node;

const RANDOM: &str = "java.util.Random";

fn report(context: &Context, at: Node, generator: &str) {
    for label in super::super::place::methods(context, at) {
        report_in(context, at, generator, &label);
    }
}

/// Two generators of one method on one line are one finding.
fn report_in(context: &Context, at: Node, generator: &str, label: &str) {
    let message = format!("This random generator ({generator}) is predictable");
    let place = super::super::place::function(label);
    let line = context.line(at);
    let same = |found: &crate::engine::finding::Finding| found.rule == "PREDICTABLE_RANDOM" && found.line == line && found.symbol.as_deref() == Some(place.as_str());
    if context.out.borrow().iter().any(|found| same(found) && found.message == message) {
        return;
    }
    context.report_listed("PREDICTABLE_RANDOM", at, context.line(at), message, place, 2, vec![generator.to_string()]);
}

/// What a call or creation builds or hands out, when it is a predictable generator.
pub fn generator(context: &Context, node: Node) -> Option<&'static str> {
    let resolver = context.resolver;
    match node.kind() {
        "object_creation_expression" => {
            let made = node.child_by_field_name("type").and_then(|written| resolver.type_node(written))?.name();
            (made == RANDOM).then_some(RANDOM)
        }
        "method_invocation" => {
            let name = context.text(node.child_by_field_name("name")?);
            if !matches!(name, "current" | "random") {
                return None;
            }
            let found = resolver.resolve_call(node)?;
            match (found.declaring.as_str(), name) {
                ("java.util.concurrent.ThreadLocalRandom", "current") => Some("java.util.concurrent.ThreadLocalRandom"),
                ("java.lang.Math", "random") => Some("java.lang.Math.random()"),
                _ => None,
            }
        }
        _ => None,
    }
}

/// A `Random` made as an anonymous class is built inside the constructor javac writes for that class.
pub fn check(context: &Context, node: Node) {
    let Some(generator) = generator(context, node) else { return };
    let anonymous = children(node).iter().any(|part| part.kind() == "class_body");
    match context.resolver.scope.names.get(&node.id()).filter(|_| anonymous) {
        Some(own) => report_in(context, node, generator, &super::super::names::anonymous(context, own, node)),
        None => report(context, node, generator),
    }
}

/// A named class that extends `Random` directly: each of its constructors calls `Random`'s, written or not.
pub fn subclass(context: &Context, class: Node) {
    for (at, label) in super_calls(context, class, RANDOM) {
        report_in(context, at, RANDOM, &label);
    }
}

/// Where the constructors of a named class that extends a class directly call that class's constructor, with the
/// label of each constructor: the `super(...)` call, the name of a constructor that calls none, or the `class`
/// keyword for the constructor javac writes.
pub fn super_calls<'a>(context: &Context, class: Node<'a>, superclass: &str) -> Vec<(Node<'a>, String)> {
    if class.kind() != "class_declaration" {
        return Vec::new();
    }
    let Some(extended) = class.child_by_field_name("superclass").and_then(|written| written.named_child(0)) else { return Vec::new() };
    if context.resolver.type_node(extended).is_none_or(|kind| kind.name() != superclass) {
        return Vec::new();
    }
    let Some(body) = class.child_by_field_name("body") else { return Vec::new() };
    let Some(own) = context.resolver.scope.names.get(&class.id()) else { return Vec::new() };
    let label = |member: Node| super::member_label(context, own, class, member).unwrap_or_default();
    let constructors: Vec<Node> = children(body).into_iter().filter(|member| member.kind() == "constructor_declaration").collect();
    let mut found = Vec::new();
    if constructors.is_empty() {
        let keyword = children(class).into_iter().find(|part| part.kind() == "class").unwrap_or(class);
        found.push((keyword, label(class)));
    }
    for constructor in constructors {
        let first = constructor.child_by_field_name("body").and_then(|body| body.named_child(0));
        match first.filter(|first| first.kind() == "explicit_constructor_invocation") {
            Some(call) => {
                let target = call.child_by_field_name("constructor");
                if target.is_some_and(|target| target.kind() == "super") {
                    found.push((call, label(constructor)));
                }
            }
            None => found.push((constructor.child_by_field_name("name").unwrap_or(constructor), label(constructor))),
        }
    }
    found
}
