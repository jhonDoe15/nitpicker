//! StaticCalendarDetector rebuilt from what SpotBugs 4.9.8 reports on test code (Lombok's `@Synchronized` counts as
//! `synchronized`):
//! - STCAL_STATIC_SIMPLE_DATE_FORMAT_INSTANCE and STCAL_STATIC_CALENDAR_INSTANCE: a public or protected static
//!   field (an interface field too) whose declared type is `java.text.DateFormat` or `java.util.Calendar` or below
//!   it (or an array of those), written or not, null or not. Priority 1 for a date format and 2 for a calendar,
//!   one more when the field is not final or protected, one more when its type is the class that declares it, one
//!   less when that class is one SpotBugs takes for code run by many threads (`threaded`). No line; the place is
//!   the field.
//! - STCAL_INVOKE_ON_STATIC_DATE_FORMAT_INSTANCE and STCAL_INVOKE_ON_STATIC_CALENDAR_INSTANCE: a call on the value of
//!   such a static field of any class and access, read straight or through a local holding it, not cast to a class
//!   above both types (as `Format`). Names starting with `get`, `equals` and methods `Object` declares are left out;
//!   `set…`, `add`, `clear`, `format`, `parse` and `applyPattern` are priority 2, every other method 3; one less in a
//!   threaded class. Calls in the static initializer of the class declaring the field, a `synchronized` method or
//!   block are left out. Once per method, field and called method with its parameter types (named by the class it
//!   is called on when that is a class of the run, else by the class declaring it). The place is the field's name
//!   after the class of the calling method, shown after the class that declares it.
use super::idioms::{Compiled, compiled};
use super::dumb::numbers::stores::{local, stores};
use super::taint::lines;
use super::{Context, fields, names};
use crate::engine::source::{ancestor, children, named_children, walk};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::expr::unwrap;
use crate::java::types::model::{Type, flag};
use crate::java::types::scope::TYPE_DECLARATIONS;
use std::collections::HashSet;
use tree_sitter::Node;

pub const STATIC_FORMAT: &str = "STCAL_STATIC_SIMPLE_DATE_FORMAT_INSTANCE";
pub const STATIC_CALENDAR: &str = "STCAL_STATIC_CALENDAR_INSTANCE";
pub const CALL_FORMAT: &str = "STCAL_INVOKE_ON_STATIC_DATE_FORMAT_INSTANCE";
pub const CALL_CALENDAR: &str = "STCAL_INVOKE_ON_STATIC_CALENDAR_INSTANCE";

pub const PATTERNS: &[&str] = &[STATIC_FORMAT, STATIC_CALENDAR, CALL_FORMAT, CALL_CALENDAR];

const FORMAT: &str = "java.text.DateFormat";
const CALENDAR: &str = "java.util.Calendar";
const CHANGING: &[&str] = &["add", "clear", "format", "parse", "applyPattern"];

/// Which of the two types a declared type is or extends.
fn unsafe_type(context: &Context, kind: &Type) -> Option<&'static str> {
    let mut kind = kind.erased();
    while let Type::Array(inner) = kind {
        kind = inner.erased();
    }
    let Type::Class(name, _) = kind else { return None };
    let index = context.resolver.index;
    if index.is_subtype(&name, FORMAT) {
        return Some(FORMAT);
    }
    index.is_subtype(&name, CALENDAR).then_some(CALENDAR)
}

fn body_of(class: Node) -> Option<Node> {
    class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"))
}

/// Whether SpotBugs takes the class for code run by many threads: it has a `synchronized` method or block, or a
/// `volatile` field. Classes declared inside count on their own.
fn threaded(context: &Context, class: Node) -> bool {
    let Some(body) = body_of(class) else { return false };
    let mut found = false;
    let mut pending = vec![body];
    while let Some(node) = pending.pop() {
        if found {
            break;
        }
        for part in children(node) {
            if part.kind() == "class_body" || TYPE_DECLARATIONS.contains(&part.kind()) {
                continue;
            }
            let marked = match part.kind() {
                "method_declaration" => synchronized(context, part),
                "field_declaration" => has_modifier(part, "volatile"),
                "synchronized_statement" => true,
                _ => false,
            };
            found |= marked;
            pending.push(part);
        }
    }
    found
}

fn static_fields(context: &Context, own: &str, class: Node, threaded: bool) {
    let Some(body) = body_of(class) else { return };
    let interface = matches!(class.kind(), "interface_declaration" | "annotation_type_declaration");
    let binary = names::binary(context, own);
    for member in super::place::members(body).into_iter().filter(|member| matches!(member.kind(), "field_declaration" | "constant_declaration")) {
        let open = interface || has_modifier(member, "public") || has_modifier(member, "protected");
        if !open || !(interface || has_modifier(member, "static")) {
            continue;
        }
        let loose = !(interface || has_modifier(member, "final")) || has_modifier(member, "protected");
        for declarator in declarators(member) {
            let Some(name) = declarator.child_by_field_name("name").map(|name| context.text(name)) else { continue };
            let Some((_, field)) = context.resolver.index.field(own, name) else { continue };
            let Some(kind) = unsafe_type(context, &field.kind) else { continue };
            let own_type = field.kind.erased().name() == own;
            let base = if kind == FORMAT { 1 } else { 2 };
            let priority = (base + u8::from(loose) + u8::from(own_type)).saturating_sub(u8::from(threaded)).max(1);
            if priority > 2 {
                continue;
            }
            let qualified = format!("{binary}.{name}");
            let (pattern, message) = if kind == FORMAT {
                (STATIC_FORMAT, format!("{qualified} is a static field of type {FORMAT}, which isn't thread safe"))
            } else {
                (STATIC_CALENDAR, format!("{qualified} is static field of type {CALENDAR}, which isn't thread safe"))
            };
            context.report_listed(pattern, declarator, 0, message, format!("member:{qualified}"), priority, vec![qualified]);
        }
    }
}

/// The static field of one of the two types whose value a call's object is: read there, or held by a local whose
/// one reaching store reads it, through casts and parentheses.
fn static_field(context: &Context, object: Node, depth: usize) -> Option<(String, String, &'static str)> {
    let object = unwrap(object);
    match object.kind() {
        "cast_expression" => return static_field(context, object.child_by_field_name("value")?, depth),
        "identifier" if depth < 4 && local(context, object) => {
            let [store] = stores(context, object, context.text(object))[..] else { return None };
            let value = match store.kind() {
                "variable_declarator" => store.child_by_field_name("value")?,
                "assignment_expression" if store.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=") => store.child_by_field_name("right")?,
                _ => return None,
            };
            return static_field(context, value, depth + 1);
        }
        "identifier" | "field_access" => {}
        _ => return None,
    }
    let (declaring, name) = fields::field_key(context, object)?;
    let (_, field) = context.resolver.index.field(&declaring, &name)?;
    if field.flags & flag::STATIC == 0 {
        return None;
    }
    let kind = unsafe_type(context, &field.kind)?;
    Some((name, declaring, kind))
}

fn synchronized(context: &Context, method: Node) -> bool {
    has_modifier(method, "synchronized") || super::lombok::annotated(context, method, "Synchronized")
}

fn locked(context: &Context, method: &Compiled, call: Node) -> bool {
    let synchronized_method = method.member.kind() == "method_declaration" && synchronized(context, method.member);
    synchronized_method || ancestor(call, &["synchronized_statement", "lambda_expression", "class_body"]).is_some_and(|around| around.kind() == "synchronized_statement")
}

fn calls(context: &Context, own: &str, methods: &[Compiled], threaded: bool) {
    let binary = names::binary(context, own);
    for method in methods {
        let initializer = method.label.contains(".<static initializer for ");
        let mut seen = HashSet::new();
        for call in method.nodes.iter().copied().filter(|node| node.kind() == "method_invocation") {
            let Some(object) = call.child_by_field_name("object") else { continue };
            let Some((field, declaring, kind)) = static_field(context, object, 0) else { continue };
            if initializer && declaring == own {
                continue;
            }
            let name = call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
            if name.starts_with("get") || name == "equals" || locked(context, method, call) {
                continue;
            }
            let resolved = context.resolver.resolve_call(call);
            if resolved.as_ref().is_some_and(|found| found.declaring == "java.lang.Object") {
                continue;
            }
            let arity = call.child_by_field_name("arguments").map_or(0, |arguments| named_children(arguments).into_iter().filter(|part| !part.kind().ends_with("comment")).count());
            let descriptor = resolved.as_ref().map_or_else(|| arity.to_string(), |found| format!("{:?}", found.method.parameters));
            let receiver = context.resolver.type_of(object);
            if receiver.as_ref().and_then(|kind| unsafe_type(context, kind)).is_none() {
                continue;
            }
            let receiver = receiver.map(|kind| kind.erased().name()).unwrap_or_default();
            let owner = if context.project.sources.contains_key(&receiver) { receiver } else { resolved.as_ref().map(|found| found.declaring.clone()).unwrap_or_default() };
            if !seen.insert((field.clone(), owner, name.to_string(), descriptor)) {
                continue;
            }
            let changing = name.starts_with("set") || CHANGING.contains(&name);
            let priority = (if changing { 2 } else { 3 }) - u8::from(threaded);
            if priority > 2 {
                continue;
            }
            let pattern = if kind == FORMAT { CALL_FORMAT } else { CALL_CALENDAR };
            let message = format!("Call to method of static {kind} in {}", method.label);
            let place = format!("member:{binary}.{field}@{}", names::field(context, own, &declaring, &field));
            context.report_listed(pattern, call, lines::line(context, call), message, place, priority, vec![method.label.clone()]);
        }
    }
}

pub fn calendars<'a>(context: &Context<'a>, class: Node<'a>) {
    if !context.wants(PATTERNS) {
        return;
    }
    let declared = TYPE_DECLARATIONS.contains(&class.kind()) || matches!(class.kind(), "object_creation_expression" | "enum_constant");
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned().filter(|_| declared) else { return };
    let threaded = threaded(context, class);
    static_fields(context, &own, class, threaded);
    let mut any = false;
    walk(class, |node| any |= node.kind() == "method_invocation");
    if any {
        calls(context, &own, &compiled(context, &own, class), threaded);
    }
}
