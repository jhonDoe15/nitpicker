//! Where SpotBugs says a number on the stack came from, for naming it in a message and in the SARIF place: the
//! local variable loaded (seen through casts, `x = v` and a local that only copies another), the field read, the
//! method called, or nothing it can name.
use super::super::super::idioms::called;
use super::super::super::{Context, names, place};
use crate::java::types::scope::enclosing_types;
use super::values::{operator, stores};
use crate::java::types::expr::{Binding, unwrap};
use tree_sitter::Node;

const BOXES: &[&str] = &["java.lang.Byte", "java.lang.Short", "java.lang.Character", "java.lang.Integer", "java.lang.Long"];

pub enum Source {
    Local(String),
    Field(String, String),
    Call(String),
    Other,
}

fn copied<'t>(context: &Context, node: Node<'t>) -> Option<Node<'t>> {
    let [store] = stores(context, node, context.text(node))[..] else { return None };
    let value = match store.kind() {
        "variable_declarator" => store.child_by_field_name("value"),
        "assignment_expression" if operator(context, store) == "=" => store.child_by_field_name("right"),
        _ => None,
    }
    .map(unwrap)?;
    let local = value.kind() == "identifier" && matches!(context.resolver.binding(value, context.text(value)), Some(Binding::Local(_)));
    local.then_some(value)
}

pub fn source(context: &Context, node: Node, depth: usize) -> Source {
    let node = unwrap(node);
    if depth > 6 {
        return Source::Other;
    }
    match node.kind() {
        "assignment_expression" if operator(context, node) == "=" => node.child_by_field_name("right").map_or(Source::Other, |right| source(context, right, depth + 1)),
        "cast_expression" => node.child_by_field_name("value").map_or(Source::Other, |value| source(context, value, depth + 1)),
        "update_expression" => match crate::engine::source::named_children(node).first() {
            Some(name) if name.kind() == "identifier" && name.start_byte() > node.start_byte() => source(context, *name, depth + 1),
            _ => Source::Other,
        },
        "identifier" => match context.resolver.binding(node, context.text(node)) {
            Some(Binding::Local(_)) => match copied(context, node) {
                Some(original) => source(context, original, depth + 1),
                None => Source::Local(context.text(node).to_string()),
            },
            _ => super::super::super::fields::field_key(context, node).map_or(Source::Other, |(class, name)| Source::Field(class, name)),
        },
        "field_access" => super::super::super::fields::field_key(context, node).map_or(Source::Other, |(class, name)| Source::Field(class, name)),
        "method_invocation" => {
            let Some(call) = context.resolver.resolve_call(node) else { return Source::Other };
            let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
            let arguments = node.child_by_field_name("arguments").map(crate::engine::source::named_children).unwrap_or_default();
            if name == "valueOf" && BOXES.contains(&call.declaring.as_str()) && arguments.len() == 1 && matches!(call.method.parameters.first(), Some(crate::java::types::model::Type::Primitive(_))) {
                return source(context, arguments[0], depth + 1);
            }
            let unboxing = call.declaring.starts_with("java.lang.") && name.ends_with("Value") && BOXES.contains(&call.declaring.as_str());
            if let Some(object) = node.child_by_field_name("object").filter(|_| unboxing) {
                return source(context, object, depth + 1);
            }
            if let Some(boxed) = context.resolver.type_of(node).map(|kind| kind.name()).filter(|kind| BOXES.contains(&kind.as_str())) {
                let primitive = super::values::primitive(context, node).unwrap_or_default();
                let short = boxed.trim_start_matches("java.lang.");
                return Source::Call(format!("{short}.{primitive}Value()"));
            }
            let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
            Source::Call(called(context, &call.declaring, name, &call.method.parameters))
        }
        _ => Source::Other,
    }
}

/// The SARIF place of a called method, shown without the current package, its file in the current package.
pub fn called_place(context: &Context, node: Node, called: &str) -> String {
    let class = enclosing_types(context.resolver.scope, node).into_iter().next();
    let own = class.as_deref().map(|class| names::binary(context, class)).unwrap_or_default();
    let package = names::package_of(&own);
    let shown = called.strip_prefix(&format!("{package}.")).filter(|_| !package.is_empty()).unwrap_or(called);
    format!("function:{called}|{package}@{shown}")
}

/// The SARIF place of a finding about a value at `node`.
pub fn placed(context: &Context, node: Node, label: &str, source: &Source) -> String {
    match source {
        Source::Local(name) => place::variable(label, name),
        Source::Field(class, name) => place::member(context, class, name),
        Source::Call(called) => called_place(context, node, called),
        Source::Other => place::function(label),
    }
}
