//! FindFieldSelfAssignment rebuilt from what SpotBugs 4.9.8 reports on test code: SA_FIELD_SELF_ASSIGNMENT and
//! SA_LOCAL_DOUBLE_ASSIGNMENT (`doubled`).
//! - A store into an instance field of `this` or of the object in a local variable or parameter of the value read
//!   from that same field of that same object (`f = f`, `x.f = x.f`, `v = f; ...; f = v`, `r = this; r.f = f`),
//!   when nothing in between made the value read out of date (`flow`): no call (boxing, a switch on an object),
//!   no store into that field (of any object), no loop head with a jump back; paths that meet must agree. Fields
//!   of the object around count in the body of a constructor of an inner class (`outer_of`). `x.f = x.f++` too.
//! - The SARIF place is the parameter SpotBugs suggests (`suggest`), else the field. The priority is 1 for all
//!   findings of a method when one has its object outside slot 0, else for a suggested parameter the method does
//!   not read or `x.f = x.f++`; else 2. SpotBugs also gives priority 1 to every finding after the first `dup`
//!   that javac follows with a store into a local in the run, which the engine does not follow: both priorities
//!   have the same SARIF level.
//! - One finding per qualifying class, field, line and priority of a method; the message names the field by the
//!   class the code names it by.
mod doubled;
mod flow;
mod reach;
mod same;
mod suggest;

use super::idioms::{Compiled, compiled, initializes};
use super::nulls::redundant::line_before;
use super::{Context, names, place};
use crate::engine::source::{children, named_children};
use crate::java::helpers::has_modifier;
use crate::java::types::scope::TYPE_DECLARATIONS;
use std::collections::HashSet;
use tree_sitter::Node;
use flow::Walk;
use flow::values::State;

pub const SELF: &str = "SA_FIELD_SELF_ASSIGNMENT";
pub use doubled::DOUBLE;
pub const PATTERNS: &[&str] = &[SELF, DOUBLE, same::FIELD_COMPARISON, same::LOCAL_COMPARISON, same::FIELD_COMPUTATION, same::LOCAL_COMPUTATION, same::DOUBLE];

pub fn assignments<'a>(context: &Context<'a>, class: Node<'a>) {
    if !context.wants(PATTERNS) {
        return;
    }
    let declared = TYPE_DECLARATIONS.contains(&class.kind()) || matches!(class.kind(), "object_creation_expression" | "enum_constant");
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned().filter(|_| declared) else { return };
    for method in compiled(context, &own, class) {
        if context.wants(&[DOUBLE]) {
            doubled::check(context, &method);
        }
        if context.wants(&[SELF]) {
            self_assignments(context, &own, class, &method);
        }
    }
}

/// FindSelfComparison and FindSelfComparison2 on the classes of the file; findings that hang on what other files
/// do wait for `effects`.
pub fn comparisons<'a>(context: &Context<'a>, declared: &[Node<'a>], effects: &super::returns::Effects) {
    if !context.wants(same::PATTERNS) {
        return;
    }
    let mut waiting = Vec::new();
    for class in declared.iter().copied().filter(|class| TYPE_DECLARATIONS.contains(&class.kind()) || matches!(class.kind(), "object_creation_expression" | "enum_constant")) {
        let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { continue };
        for method in compiled(context, &own, class) {
            waiting.extend(same::check(context, &own, class, &method));
        }
    }
    same::note(context, effects, waiting);
}

fn interface(class: Node) -> bool {
    matches!(class.kind(), "interface_declaration" | "annotation_type_declaration")
}

fn class_body(class: Node) -> Option<Node> {
    class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"))
}

/// Whether the method has no `this`.
fn fixed(context: &Context, method: &Compiled) -> bool {
    if method.lambda {
        return !super::locals::lambdas::uses_this(context, method.member);
    }
    match method.member.kind() {
        "method_declaration" => has_modifier(method.member, "static"),
        "constructor_declaration" | "compact_constructor_declaration" => false,
        _ => method.label.contains(".<static initializer for "),
    }
}

/// The field initializers and initializer blocks javac copies into a constructor, or into the static initializer.
fn initializers<'a>(class: Node<'a>, wanted_static: bool) -> Vec<Node<'a>> {
    let Some(body) = class_body(class) else { return Vec::new() };
    let members = place::members(body).into_iter().filter(|member| initializes(*member, interface(class), wanted_static));
    members.map(|member| if member.kind() == "static_initializer" { named_children(member).into_iter().next().unwrap_or(member) } else { member }).collect()
}

pub(super) fn walk_method<'c, 'a>(walk: &mut Walk<'c, 'a>, class: Node<'a>, method: &Compiled<'a>) {
    let member = method.member;
    let state = Some(State::default());
    if method.lambda {
        let Some(body) = member.child_by_field_name("body") else { return };
        let mut state = State::default();
        if body.kind() == "block" { walk.statement(body, Some(state)); } else { walk.expression(body, &mut state); }
        return;
    }
    match member.kind() {
        "method_declaration" => drop(member.child_by_field_name("body").map(|body| walk.statement(body, state))),
        "constructor_declaration" | "compact_constructor_declaration" => {
            let Some(body) = member.child_by_field_name("body") else { return };
            let mut parts = named_children(body);
            let first = parts.first().copied().filter(|part| part.kind() == "explicit_constructor_invocation");
            let mut state = State::default();
            match first {
                Some(call) => {
                    parts.remove(0);
                    walk.expression(call, &mut state);
                }
                None => walk.called(),
            }
            let delegates = first.is_some_and(|call| walk.context.text(call).trim_start().starts_with("this"));
            let state = if delegates { Some(state) } else { walk.statements(&initializers(class, false), Some(state)) };
            walk.outer = outer_of(walk.context, class);
            walk.statements(&parts, state);
            walk.outer = None;
        }
        _ if fixed(walk.context, method) => drop(walk.statements(&initializers(class, true), state)),
        _ => {
            let state = State::default();
            walk.called();
            walk.statements(&initializers(class, false), Some(state));
        }
    }
}

fn self_assignments<'a>(context: &Context<'a>, own: &str, class: Node<'a>, method: &Compiled<'a>) {
    let mut walk = Walk::new(context, own);
    walk_method(&mut walk, class, method);
    let fixed = fixed(context, method);
    let mut seen = HashSet::new();
    let found = std::mem::take(&mut walk.found);
    let moved = |store: &flow::Store| store.outer || store.register.is_some_and(|local| !(fixed && first_parameter(context, method, local)));
    let any_moved = found.iter().any(moved);
    for store in found {
        let (declaring, name) = &store.field;
        let Some(kind) = context.resolver.index.get(declaring).and_then(|info| info.fields.iter().find(|field| &field.name == name)).map(|field| field.kind.clone()) else { continue };
        let suggested = suggest::suggest(context, class, method, fixed, &kind, name);
        let priority = if store.postfix || any_moved || suggested.as_ref().is_some_and(|suggested| suggested.unread) { 1 } else { 2 };
        let line = line_before(context, store.at, store.at.end_byte());
        if !seen.insert((store.qualifying.clone(), name.clone(), line, priority)) {
            continue;
        }
        let shown = names::field(context, own, &store.qualifying, name);
        let at = match &suggested {
            Some(suggested) => place::variable(&method.label, &suggested.name),
            None => format!("{}@{shown}", place::member(context, own, name)),
        };
        let message = format!("Self assignment of field {shown} in {}", method.label);
        context.report_listed(SELF, store.at, line, message, at, priority, vec![shown, method.label.clone()]);
    }
}

/// The class whose object a constructor of the class gets as a hidden parameter: the one around an inner class,
/// or around a local class declared where there is a `this`.
pub fn outer_of(context: &Context, class: Node) -> Option<String> {
    if class.kind() != "class_declaration" || has_modifier(class, "static") {
        return None;
    }
    let holder = crate::engine::source::parent(class)?;
    let member = holder.kind() == "class_body" && crate::engine::source::parent(holder).is_some_and(|around| !interface(around));
    let mut local = None;
    let mut at = Some(holder);
    while let Some(node) = at.filter(|_| holder.kind() != "class_body") {
        match node.kind() {
            "method_declaration" => local = Some(!has_modifier(node, "static")),
            "constructor_declaration" | "compact_constructor_declaration" => local = Some(true),
            "static_initializer" => local = Some(false),
            "field_declaration" => local = Some(!has_modifier(node, "static")),
            "class_body" => local = Some(true),
            _ => {}
        }
        if local.is_some() {
            break;
        }
        at = crate::engine::source::parent(node);
    }
    (member || local == Some(true)).then(|| crate::java::types::scope::enclosing_types(context.resolver.scope, holder).into_iter().next()).flatten()
}

/// Whether a local variable is the first parameter of the method, the one in slot 0 of a static method.
fn first_parameter(context: &Context, method: &Compiled, local: Node) -> bool {
    let first = method.member.child_by_field_name("parameters").and_then(|list| named_children(list).into_iter().find(|part| part.kind() == "formal_parameter"));
    first.and_then(super::expose::parameter_name).is_some_and(|name| context.text(name) == context.text(local))
}
