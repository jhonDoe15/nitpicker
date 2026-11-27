//! UR_UNINIT_READ (FindUninitializedGet): a constructor reads a field of its class through `this` before anything
//! writes it. javac's order counts: the field initializers and initializer blocks run first in every constructor
//! that does not start with `this(...)`, a `finally` block comes before the `catch` blocks and again before each jump
//! out of it, and a write anywhere earlier counts, on any instance and on any path. Only the first read of each field
//! counts; it is not reported inside a loop javac jumps back in (see `loops`), nor at priority 2 when javac follows it
//! with `ifnonnull` (see `checks`), and `field++` or `field += x` is no read. Nothing counts after a call made on the
//! class itself or a `start` call (see `walk`), a `super.` call or a `new` of the class.
//! A constructor with a parameter whose class name starts with the class's own is skipped.
//!
//! Priority 1 names the parameter the constructor probably meant: of the parameters of the field's erased type the
//! constructor never uses, the one closest to the field's name, else the only one of that type whose name is at most
//! two edits from the field's. Otherwise priority 2, placed on the field.
mod checks;
mod loops;
mod hidden;
mod walk;

use super::super::{Context, names, place, statements};
use crate::engine::source::{children, parent, walk as every};
use crate::java::types::expr::Binding;
use crate::java::types::model::Type;
use tree_sitter::Node;

pub const PATTERN: &str = "UR_UNINIT_READ";

struct Parameter {
    name: String,
    kind: Type,
    used: bool,
}

fn edits(from: &str, to: &str) -> usize {
    let (from, to): (Vec<char>, Vec<char>) = (from.chars().collect(), to.chars().collect());
    let mut row: Vec<usize> = (0..=to.len()).collect();
    for (at, letter) in from.iter().enumerate() {
        let mut next = vec![at + 1];
        for (place, other) in to.iter().enumerate() {
            next.push((usize::from(letter != other) + row[place]).min(row[place + 1] + 1).min(next[place] + 1));
        }
        row = next;
    }
    row[to.len()]
}

/// Whether the constructor's code loads a parameter: any use but as the target of a plain assignment.
fn uses(context: &Context, body: Node, name: &str) -> bool {
    let mut found = false;
    every(body, |node| {
        if found || node.kind() != "identifier" || context.text(node) != name {
            return;
        }
        let assigned = parent(node).is_some_and(|holder| {
            holder.kind() == "assignment_expression"
                && holder.child_by_field_name("left").is_some_and(|left| left.id() == node.id())
                && holder.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=")
        });
        found = !assigned && matches!(context.resolver.binding(node, name), Some(Binding::Local(_)));
    });
    found
}

/// The parameters javac gives a constructor: the instance around an inner class, the name and ordinal of an enum
/// constant, then the declared ones.
fn parameters(context: &Context, class: Node, constructor: Option<Node>) -> Vec<Parameter> {
    let mut found = Vec::new();
    if let Some(outer) = crate::java::javac::instance_around(context.resolver, class) {
        found.push(Parameter { name: "this$0".into(), kind: Type::class(&outer), used: true });
    }
    if class.kind() == "enum_declaration" {
        found.push(Parameter { name: "$enum$name".into(), kind: Type::class("java.lang.String"), used: true });
        found.push(Parameter { name: "$enum$ordinal".into(), kind: Type::Primitive("int"), used: true });
    }
    let Some(constructor) = constructor else { return found };
    let list = constructor.child_by_field_name("parameters");
    let (erased, _, _) = context.resolver.parameters(list);
    let declared = list.map(children).unwrap_or_default().into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter"));
    let body = constructor.child_by_field_name("body");
    for (parameter, kind) in declared.zip(erased) {
        let name = parameter.child_by_field_name("name").or_else(|| crate::engine::source::named_children(parameter).into_iter().rev().find(|part| part.kind() == "variable_declarator").and_then(|part| part.child_by_field_name("name")));
        let name = name.map(|name| context.text(name).to_string()).unwrap_or_default();
        let used = body.is_some_and(|body| uses(context, body, &name));
        found.push(Parameter { name, kind, used });
    }
    found
}

/// Whether a parameter's class name starts with the class's own, which makes SpotBugs pass the constructor by.
fn skipped(context: &Context, own: &str, parameters: &[Parameter]) -> bool {
    let binary = names::binary(context, own);
    parameters.iter().any(|parameter| {
        let mut kind = &parameter.kind;
        while let Type::Array(element) = kind {
            kind = element;
        }
        matches!(kind, Type::Class(name, _) if names::binary(context, name).starts_with(&binary))
    })
}

/// The parameter SpotBugs names for an uninitialized read of a field of type `kind`, if one stands out.
fn meant<'p>(parameters: &'p [Parameter], field: &str, kind: &Type) -> Option<&'p Parameter> {
    let same: Vec<&Parameter> = parameters.iter().filter(|parameter| parameter.kind == *kind).collect();
    let unused: Vec<&&Parameter> = same.iter().filter(|parameter| !parameter.used).collect();
    let nearest = unused.iter().map(|parameter| edits(&parameter.name, field)).min();
    let closest: Vec<&&&Parameter> = unused.iter().filter(|parameter| Some(edits(&parameter.name, field)) == nearest).collect();
    if let [only] = closest.as_slice() {
        return Some(only);
    }
    let close: Vec<&&Parameter> = same.iter().filter(|parameter| edits(&parameter.name, field) <= 2).collect();
    if let [only] = close.as_slice() { Some(only) } else { None }
}

fn starts_with_this(constructor: Node) -> bool {
    let first = constructor.child_by_field_name("body").and_then(|body| crate::engine::source::named_children(body).into_iter().find(|part| !part.kind().ends_with("comment")));
    first.is_some_and(|first| first.kind() == "explicit_constructor_invocation" && first.child_by_field_name("constructor").is_some_and(|called| called.kind() == "this"))
}

pub fn uninitialized<'a>(context: &Context<'a>, class: Node<'a>) {
    if !context.wants(&[PATTERN]) || !matches!(class.kind(), "class_declaration" | "enum_declaration") {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()) else { return };
    let Some(body) = class.child_by_field_name("body") else { return };
    let members = place::members(body);
    let initializers: Vec<Node> = members.iter().copied().filter(|member| match member.kind() {
        "field_declaration" => !crate::java::helpers::has_modifier(*member, "static"),
        kind => kind == "block",
    }).collect();
    let mut constructors: Vec<Option<Node>> = members.iter().copied().filter(|member| member.kind() == "constructor_declaration").map(Some).collect();
    if constructors.is_empty() {
        constructors.push(None);
    }
    for constructor in constructors {
        if constructor.is_some_and(starts_with_this) {
            continue;
        }
        let parameters = parameters(context, class, constructor);
        if skipped(context, own, &parameters) {
            continue;
        }
        let Some(label) = statements::member_label(context, own, class, constructor.unwrap_or(class)) else { continue };
        let mut walk = walk::Walk::new(context, own);
        let statements: Vec<Node> = constructor.and_then(|constructor| constructor.child_by_field_name("body")).map(children).unwrap_or_default();
        let (first, rest) = match statements.iter().position(|part| part.kind() == "explicit_constructor_invocation") {
            Some(at) => (statements[..=at].to_vec(), statements[at + 1..].to_vec()),
            None => (Vec::new(), statements),
        };
        for part in first.into_iter().chain(initializers.iter().copied()).chain(rest) {
            walk.visit(part);
        }
        for read in walk.found {
            let Some((_, field)) = context.resolver.index.field(own, &read.field) else { continue };
            let message = format!("Uninitialized read of {} in {label}", read.field);
            let arguments = vec![read.field.clone(), label.clone()];
            let (symbol, priority) = match meant(&parameters, &read.field, &field.kind) {
                Some(parameter) => (place::variable(&label, &parameter.name), 1),
                None if read.tested => continue,
                None => (place::member(context, own, &read.field), 2),
            };
            context.report_listed(PATTERN, read.node, context.line(read.node), message, symbol, priority, arguments);
        }
    }
}
