//! The place a SpotBugs SARIF report names for a finding, written `kind:fully qualified name`: a method
//! (`function`), a field (`member`), a local variable (`variable`, `method#name`, `#?` for a value without one) or a
//! class (`type`).
use super::{Context, names};
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::scope::TYPE_DECLARATIONS;
use crate::engine::source::{ancestor, children, parent};
use crate::java::helpers::has_modifier;
use tree_sitter::Node;

pub fn function(label: &str) -> String {
    format!("function:{label}")
}

pub fn member(context: &Context, class: &str, field: &str) -> String {
    format!("member:{}.{field}", names::binary(context, class))
}

pub fn variable(label: &str, name: &str) -> String {
    format!("variable:{label}#{name}")
}

pub fn class(context: &Context, class: &str) -> String {
    format!("type:{}", names::binary(context, class))
}

/// The place SpotBugs names for a value an instruction uses: the field it was read from, the local variable that
/// held it, or `?` for anything else.
pub fn value(context: &Context, label: &str, node: Node) -> String {
    let node = unwrap(node);
    let field = super::fields::field_key(context, node);
    match node.kind() {
        "identifier" => match context.resolver.binding(node, context.text(node)) {
            Some(Binding::Local(_)) => variable(label, context.text(node)),
            _ => field.map_or_else(|| variable(label, "?"), |(class, name)| member(context, &class, &name)),
        },
        "field_access" => field.map_or_else(|| variable(label, "?"), |(class, name)| member(context, &class, &name)),
        _ => variable(label, "?"),
    }
}

/// The methods SpotBugs names for code at `node`: the lambda, method or constructor around it; for a field
/// initializer or initializer block, the static initializer, or every constructor that runs the initializers
/// (each one that does not start with `this(...)`), since javac copies them into each.
pub fn methods(context: &Context, node: Node) -> Vec<String> {
    if let Some(label) = names::around(context, node) {
        return vec![label];
    }
    let Some(body) = ancestor(node, &["class_body", "enum_body", "interface_body", "annotation_type_body"]) else { return Vec::new() };
    let Some(class) = parent(body).filter(|class| TYPE_DECLARATIONS.contains(&class.kind())) else { return Vec::new() };
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { return Vec::new() };
    let members = members(body);
    let member = members
        .iter()
        .copied()
        .find(|member| member.start_byte() <= node.start_byte() && node.end_byte() <= member.end_byte());
    let Some(member) = member else { return Vec::new() };
    let is_static = match member.kind() {
        "static_initializer" | "enum_constant" | "constant_declaration" => true,
        "field_declaration" => has_modifier(member, "static") || class.kind() == "interface_declaration",
        "block" => false,
        _ => return Vec::new(),
    };
    if is_static {
        let binary = names::binary(context, &own);
        let simple = binary.rsplit(['.', '$']).next().unwrap_or(&binary).to_string();
        return vec![format!("{binary}.<static initializer for {simple}>()")];
    }
    let creates = ["constructor_declaration", "compact_constructor_declaration"];
    let constructors: Vec<Node> = members.into_iter().filter(|member| creates.contains(&member.kind())).collect();
    if constructors.is_empty() {
        return super::statements::member_label(context, &own, class, class).into_iter().collect();
    }
    constructors
        .into_iter()
        .filter(|constructor| {
            let first = constructor.child_by_field_name("body").and_then(|body| body.named_child(0));
            !first.is_some_and(|first| first.kind() == "explicit_constructor_invocation" && first.child_by_field_name("constructor").is_some_and(|called| called.kind() == "this"))
        })
        .filter_map(|constructor| super::statements::member_label(context, &own, class, constructor))
        .collect()
}

/// The members of a class body, with those after an enum's constants in place of the part that holds them.
pub fn members(body: Node) -> Vec<Node> {
    let after = children(body).into_iter().filter(|part| part.kind() == "enum_body_declarations").flat_map(children);
    children(body).into_iter().filter(|part| part.kind() != "enum_body_declarations").chain(after).collect()
}
