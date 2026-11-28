//! ModifyingCollectionWithItself: `addAll`, `removeAll`, `containsAll` or `retainAll` of a collection with itself.
use super::fixes::Fix;
use super::symbol_key::same_symbol as same_variable;
use super::parts::{arguments, enclosing_method};
use super::shape::preferred;
use super::Context;
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::declarators;
use crate::java::types::expr::Binding;
use crate::java::types::model::Type;
use tree_sitter::Node;

const MESSAGE: &str = "Using a collection function with itself as the argument.";

fn is_collection(context: &Context, kind: Option<Type>) -> bool {
    matches!(kind, Some(Type::Class(name, _)) if context.resolver.index.is_subtype(&name, "java.util.Collection"))
}

fn simple_name<'f>(context: &'f Context, node: Node) -> &'f str {
    match node.kind() {
        "field_access" => node.child_by_field_name("field").map(|part| context.text(part)).unwrap_or_default(),
        _ => context.text(node),
    }
}

/// The names at the smallest edit distance from `base`, in order.
fn nearest(base: &str, names: Vec<String>) -> Vec<String> {
    let distance = |name: &String| super::javadoc::edit_distance(base, name);
    let best = names.iter().map(distance).min();
    names.into_iter().filter(|name| Some(distance(name)) == best).collect()
}

fn parameter_fixes(context: &Context, call: Node, input: Node) -> Vec<Fix> {
    let Some(list) = enclosing_method(call).and_then(|method| method.child_by_field_name("parameters")) else { return Vec::new() };
    let mut names = Vec::new();
    for parameter in named_children(list).into_iter().filter(|part| part.kind() == "formal_parameter") {
        let Some(name) = parameter.child_by_field_name("name") else { continue };
        if is_collection(context, context.resolver.declared_type(parameter, None)) {
            names.push(context.text(name).to_string());
        }
    }
    nearest(simple_name(context, input), names).into_iter().map(|name| Fix::replace(input.start_byte(), input.end_byte(), name)).collect()
}

fn class_members<'t>(call: Node<'t>) -> Vec<Node<'t>> {
    let Some(body) = crate::engine::source::ancestor(call, &["class_body", "interface_body", "enum_body", "annotation_type_body"]) else { return Vec::new() };
    let mut members = children(body);
    if body.kind() == "enum_body" {
        members = members.into_iter().filter(|part| part.kind() == "enum_body_declarations").flat_map(children).collect();
    }
    members
}

fn field_fixes(context: &Context, call: Node, input: Node) -> Vec<Fix> {
    let mut names = Vec::new();
    for member in class_members(call).into_iter().filter(|part| part.kind() == "field_declaration") {
        for declarator in declarators(member) {
            let Some(name) = declarator.child_by_field_name("name") else { continue };
            if is_collection(context, context.resolver.declared_type(member, Some(declarator))) {
                names.push(context.text(name).to_string());
            }
        }
    }
    nearest(simple_name(context, input), names).into_iter().map(|name| Fix::replace(input.start_byte(), input.end_byte(), format!("this.{name}"))).collect()
}

fn literal_fix(context: &Context, call: Node, receiver: Node) -> Vec<Fix> {
    let Some(statement) = parent(call).filter(|up| up.kind() == "expression_statement") else { return Vec::new() };
    let removes = call.child_by_field_name("name").is_some_and(|name| context.text(name) == "removeAll");
    if removes {
        vec![Fix::replace(call.start_byte(), call.end_byte(), format!("{}.clear()", context.text(receiver)))]
    } else {
        vec![Fix::replace(statement.start_byte(), statement.end_byte(), "")]
    }
}

pub fn modifying_collection_with_itself(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let Some(name) = node.child_by_field_name("name").map(|name| context.text(name)) else { return };
    if !matches!(name, "addAll" | "removeAll" | "containsAll" | "retainAll") || !context.resolver.matches_sig(node, &format!("java.util.Collection#{name}(_*)")) {
        return;
    }
    let args = arguments(node);
    let Some(receiver) = node.child_by_field_name("object") else { return };
    let same = |at: usize| args.get(at).is_some_and(|argument| same_variable(context, receiver, *argument));
    if !same(0) && !(name == "addAll" && same(1)) {
        return;
    }
    let argument = if args.len() == 2 { args[1] } else { args[0] };
    let mut fixes = match receiver.kind() {
        "field_access" => parameter_fixes(context, node, argument),
        "identifier" => match context.resolver.binding(receiver, context.text(receiver)) {
            Some(Binding::Field(..)) => parameter_fixes(context, node, argument),
            _ => field_fixes(context, node, receiver),
        },
        _ => return,
    };
    if fixes.is_empty() {
        fixes = literal_fix(context, node, receiver);
    }
    context.report_fixed("ModifyingCollectionWithItself", node, preferred(node), MESSAGE, &fixes);
}
