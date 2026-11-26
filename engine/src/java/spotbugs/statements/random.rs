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

fn report_in(context: &Context, at: Node, generator: &str, label: &str) {
    let message = format!("This random generator ({generator}) is predictable");
    let place = super::super::place::function(label);
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

pub fn check(context: &Context, node: Node) {
    if let Some(generator) = generator(context, node) {
        report(context, node, generator);
    }
}

/// A named class that extends `Random` directly: each of its constructors calls `Random`'s, written or not.
pub fn subclass(context: &Context, class: Node) {
    if class.kind() != "class_declaration" {
        return;
    }
    let Some(extended) = class.child_by_field_name("superclass").and_then(|written| written.named_child(0)) else { return };
    if context.resolver.type_node(extended).is_none_or(|kind| kind.name() != RANDOM) {
        return;
    }
    let Some(body) = class.child_by_field_name("body") else { return };
    let Some(own) = context.resolver.scope.names.get(&class.id()) else { return };
    let label = |member: Node| super::member_label(context, own, class, member).unwrap_or_default();
    let constructors: Vec<Node> = children(body).into_iter().filter(|member| member.kind() == "constructor_declaration").collect();
    if constructors.is_empty() {
        let keyword = children(class).into_iter().find(|part| part.kind() == "class").unwrap_or(class);
        report_in(context, keyword, RANDOM, &label(class));
    }
    for constructor in constructors {
        let first = constructor.child_by_field_name("body").and_then(|body| body.named_child(0));
        match first.filter(|first| first.kind() == "explicit_constructor_invocation") {
            Some(call) => {
                let target = call.child_by_field_name("constructor");
                if target.is_some_and(|target| target.kind() == "super") {
                    report_in(context, call, RANDOM, &label(constructor));
                }
            }
            None => report_in(context, constructor.child_by_field_name("name").unwrap_or(constructor), RANDOM, &label(constructor)),
        }
    }
}
