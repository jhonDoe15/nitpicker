//! The place SpotBugs' SARIF report names for a reference comparison. SpotBugs notes what each compared value is,
//! the right one first: a local variable, a field or the result of a call. With `Boolean.TRUE` or `Boolean.FALSE`
//! on one side only one value is noted: a final field on the left of it, else the constant. The place is the last local noted, named in the last method noted (the
//! called method, else the one around); else the last field, named in the class around; else the method around.
use super::super::{Context, names, place};
use crate::engine::source::{ancestor, named_children, parent, walk};
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::scope::enclosing_types;
use tree_sitter::Node;

enum Mark {
    Local(String),
    /// A field's name and the binary name of the class that declares it.
    Field(String, String),
    Returned(String),
}

fn bare(mut value: Node) -> Node {
    loop {
        value = unwrap(value);
        match value.kind() {
            "cast_expression" => match value.child_by_field_name("value") {
                Some(inner) => value = inner,
                None => return value,
            },
            _ => return value,
        }
    }
}

/// Whether a value is `Boolean.TRUE` or `Boolean.FALSE`.
fn constant(context: &Context, value: Node) -> bool {
    let value = bare(value);
    let named = value.kind() == "field_access" && value.child_by_field_name("field").is_some_and(|field| matches!(context.text(field), "TRUE" | "FALSE"));
    named && super::super::fields::field_key(context, value).is_some_and(|(class, _)| class == super::BOOLEAN)
}

fn final_field(context: &Context, value: Node) -> bool {
    let value = bare(value);
    let key = super::super::fields::field_key(context, value);
    let field = key.and_then(|(class, name)| context.resolver.index.field(&class, &name).map(|(_, field)| field.flags));
    field.is_some_and(|flags| flags & crate::java::types::model::flag::FINAL != 0)
}

/// The body of the class nearest around a node that is not the class `own` itself: a local or anonymous one.
fn inner_body<'t>(context: &Context, node: Node<'t>) -> Option<Node<'t>> {
    let body = ancestor(node, &["class_body"])?;
    let holder = parent(body)?;
    let unnamed = holder.kind() == "object_creation_expression" || crate::java::javac::declared_locally(holder);
    unnamed.then_some(body).filter(|_| context.resolver.scope.names.contains_key(&holder.id()))
}

fn declares(context: &Context, body: Node, name: &str) -> bool {
    let mut found = false;
    walk(body, |part| {
        let named = matches!(part.kind(), "variable_declarator" | "formal_parameter" | "catch_formal_parameter" | "spread_parameter")
            && part.child_by_field_name("name").is_some_and(|written| context.text(written) == name);
        found |= named || (part.kind() == "inferred_parameters" && named_children(part).iter().any(|written| context.text(*written) == name));
    });
    found
}

/// The local a copy came from: `T copy = other;` with `copy` never set again names `other`.
fn source_of(context: &Context, usage: Node, name: &str) -> String {
    let Some(body) = ancestor(usage, &["method_declaration", "constructor_declaration", "lambda_expression"]) else { return name.to_string() };
    let (mut copied, mut set) = (None, false);
    walk(body, |part| match part.kind() {
        "variable_declarator" if part.child_by_field_name("name").is_some_and(|written| context.text(written) == name) => {
            copied = part.child_by_field_name("value").map(unwrap).filter(|value| value.kind() == "identifier");
        }
        "assignment_expression" | "update_expression" => {
            let target = part.child_by_field_name("left").or_else(|| named_children(part).into_iter().next());
            set |= target.is_some_and(|target| target.kind() == "identifier" && context.text(target) == name);
        }
        _ => {}
    });
    let local = |value: &Node| matches!(context.resolver.binding(*value, context.text(*value)), Some(Binding::Local(_)));
    match copied.filter(|value| !set && local(value)) {
        Some(value) => context.text(value).to_string(),
        None => name.to_string(),
    }
}

fn called(context: &Context, call: Node) -> Option<String> {
    let found = context.resolver.resolve_call(call)?;
    let owner = match call.child_by_field_name("object") {
        Some(_) => found.receiver.erased().name(),
        None => found.declaring.clone(),
    };
    let binary = names::binary(context, &owner);
    let shown = match binary.strip_prefix("java.lang.") {
        Some(simple) if !simple.contains('.') => simple.to_string(),
        _ => binary,
    };
    let parameters: Vec<String> = found.method.parameters.iter().map(|kind| names::simple(context, kind)).collect();
    Some(format!("{shown}.{}({})", found.method.name, parameters.join(", ")))
}

fn mark(context: &Context, value: Node) -> Option<Mark> {
    let value = bare(value);
    match value.kind() {
        "identifier" => {
            let name = context.text(value);
            match context.resolver.binding(value, name)? {
                Binding::Local(_) => match inner_body(context, value) {
                    Some(body) if !declares(context, body, name) => {
                        let class = enclosing_types(context.resolver.scope, value).into_iter().next()?;
                        Some(Mark::Field(format!("val${name}"), names::binary(context, &class)))
                    }
                    _ => Some(Mark::Local(source_of(context, value, name))),
                },
                Binding::Field(_, declaring, field) => {
                    let own = enclosing_types(context.resolver.scope, value);
                    let outer = own.first().is_some_and(|first| !context.resolver.index.is_subtype(first, &declaring.name));
                    (!outer).then(|| Mark::Field(field.name.clone(), names::binary(context, &declaring.name)))
                }
            }
        }
        "field_access" => {
            let (declaring, name) = super::super::fields::field_key(context, value)?;
            Some(Mark::Field(name, names::binary(context, &declaring)))
        }
        "method_invocation" => called(context, value).map(Mark::Returned),
        _ => None,
    }
}

pub fn place(context: &Context, class: &str, label: &str, left: Node, right: Node) -> String {
    let marks: Vec<Mark> = if constant(context, left) {
        mark(context, left).into_iter().collect()
    } else if constant(context, right) {
        mark(context, if final_field(context, left) { left } else { right }).into_iter().collect()
    } else {
        [right, left].into_iter().filter_map(|side| mark(context, side)).collect()
    };
    let method = marks.iter().rev().find_map(|mark| if let Mark::Returned(method) = mark { Some(method.as_str()) } else { None }).unwrap_or(label);
    let local = marks.iter().rev().find_map(|mark| if let Mark::Local(name) = mark { Some(name) } else { None });
    let field = marks.iter().rev().find_map(|mark| if let Mark::Field(name, declaring) = mark { Some((name, declaring)) } else { None });
    match (local, field) {
        (Some(name), _) => place::variable(method, name),
        (None, Some((name, declaring))) => format!("member:{class}.{name}@{declaring}"),
        _ => place::function(label),
    }
}
