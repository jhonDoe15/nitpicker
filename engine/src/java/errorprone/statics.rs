//! StaticQualifiedUsingExpression.
use super::fixes::Fix;
use super::namefixes::{Ident, find_ident};
use super::nodes::{enclosing, token};
use super::Context;
use crate::engine::source::{parent, walk};
use crate::java::types::expr::Receiver;
use crate::java::types::model::{Type, flag};
use crate::java::types::scope::enclosing_types;
use tree_sitter::Node;

/// The class that declares the static member the access reads, and whether it is a method.
fn static_member(context: &Context, node: Node, object: Node) -> Option<(String, String, bool)> {
    if node.kind() == "field_access" {
        let name = context.text(node.child_by_field_name("field")?);
        let class = match context.resolver.receiver(object)? {
            Receiver::Static(owner) | Receiver::Value(Type::Class(owner, _)) => owner,
            _ => return None,
        };
        let (info, field) = context.resolver.index.field(&class, name)?;
        return (field.flags & flag::STATIC != 0 || info.is_interface).then(|| (info.name.clone(), name.to_string(), false));
    }
    let call = context.resolver.resolve_call(node)?;
    let name = context.text(node.child_by_field_name("name")?);
    call.method.is_static.then(|| (call.declaring.clone(), name.to_string(), true))
}

/// Whether the expression names a class that is the owner or a subclass of it.
fn names_subclass(context: &Context, object: Node, owner: &str) -> bool {
    matches!(object.kind(), "identifier" | "field_access" | "scoped_identifier")
        && matches!(context.resolver.receiver(object), Some(Receiver::Static(class)) if context.resolver.index.is_subtype(&class, owner))
}

fn declares_variable(context: &Context, scope: Node, name: &str) -> bool {
    let mut found = false;
    walk(scope, |part| {
        let holder = parent(part);
        let named = |holder: Option<Node>| holder.is_some_and(|holder| holder.child_by_field_name("name").is_some_and(|written| written.id() == part.id()));
        found |= part.kind() == "identifier"
            && context.text(part) == name
            && holder.is_some_and(|holder| match holder.kind() {
                "variable_declarator" | "formal_parameter" | "catch_formal_parameter" | "enhanced_for_statement" | "resource" | "instanceof_expression" => named(Some(holder)),
                "inferred_parameters" | "type_pattern" | "record_pattern_component" => true,
                "lambda_expression" => holder.child_by_field_name("parameters").is_some_and(|list| list.id() == part.id()),
                _ => false,
            });
    });
    found
}

/// Whether the field's simple name stands for that field where the access is.
fn visible_as_field(context: &Context, at: Node, owner: &str, name: &str) -> bool {
    for class in enclosing_types(context.resolver.scope, at) {
        if let Some((info, _)) = context.resolver.index.field(&class, name) {
            return info.name == owner;
        }
    }
    false
}

/// `SuggestedFixes.qualifyType` for a symbol: the name of the class and as many of its outer classes as it takes to be found
/// where the access is; a top-level class that is not found is imported, one hidden by another name gets its package.
pub(super) fn qualify_class(context: &Context, at: Node, class: &str, imports: &mut bool) -> String {
    let parts: Vec<&str> = class.split('.').collect();
    let top = (1..=parts.len()).find(|count| context.resolver.index.has(&parts[..*count].join(".")));
    let Some(packages) = top.map(|count| count - 1) else { return class.to_string() };
    let mut names: Vec<String> = Vec::new();
    for end in (packages + 1..=parts.len()).rev() {
        names.insert(0, parts[end - 1].to_string());
        let found = find_ident(context, at, parts[end - 1]);
        if matches!(&found, Ident::Class(full) if *full == parts[..end].join(".")) {
            break;
        }
        if end == packages + 1 {
            match found {
                Ident::Nothing => *imports = true,
                _ if packages > 0 => names.insert(0, parts[..packages].join(".")),
                _ => {}
            }
            break;
        }
    }
    names.join(".")
}

const STATEMENTS: &[&str] = &["local_variable_declaration", "field_declaration", "constant_declaration", "block"];

fn statement_around(node: Node) -> Option<Node> {
    let mut current = parent(node);
    while let Some(above) = current {
        if above.kind().ends_with("_statement") || STATEMENTS.contains(&above.kind()) {
            return Some(above);
        }
        current = parent(above);
    }
    None
}

pub fn static_qualified_using_expression(context: &Context, node: Node) {
    if !matches!(node.kind(), "field_access" | "method_invocation") {
        return;
    }
    let Some(object) = node.child_by_field_name("object") else { return };
    if node.kind() == "field_access" && node.child_by_field_name("field").is_none_or(|field| field.kind() != "identifier") {
        return;
    }
    let Some((owner, name, is_method)) = static_member(context, node, object) else { return };
    if names_subclass(context, object, &owner) {
        return;
    }
    let mut imports = false;
    let own_class = enclosing_types(context.resolver.scope, node).into_iter().next();
    let replacement = if is_method && own_class.as_deref() == Some(owner.as_str()) {
        name.clone()
    } else {
        let method = enclosing(node, &["method_declaration", "constructor_declaration", "compact_constructor_declaration"]);
        let clash = !is_method && method.is_some_and(|method| declares_variable(context, method, &name));
        if !is_method && !clash && visible_as_field(context, node, &owner, &name) {
            name.clone()
        } else {
            format!("{}.{name}", qualify_class(context, node, &owner, &mut imports))
        }
    };
    let end = if node.kind() == "field_access" { node.end_byte() } else { node.child_by_field_name("name").map_or(node.end_byte(), |part| part.end_byte()) };
    let mut fix = Fix::replace(object.start_byte(), end, replacement.clone());
    if imports {
        fix = fix.with_imports();
    }
    if matches!(object.kind(), "method_invocation" | "object_creation_expression") {
        if let Some(statement) = statement_around(node) {
            fix = fix.insert(statement.start_byte(), format!("{};", context.text(object)));
        }
    }
    let dot = token(node, ".").map_or(node.start_byte(), |dot| dot.start_byte());
    let what = if is_method { "method" } else { "variable" };
    let message = format!("Static {what} {name} should not be accessed from an object instance; instead use {replacement}");
    context.report_fixed("StaticQualifiedUsingExpression", node, dot, &message, &[fix]);
}
