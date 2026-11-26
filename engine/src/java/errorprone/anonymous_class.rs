//! UnnecessaryAnonymousClass: a private final field set to an anonymous class that only implements a functional interface.
use super::Context;
use super::boxed::effectively_private;
use super::fix_helpers::remove_modifiers;
use super::fixes::Fix;
use super::hierarchy::{declared_method, super_methods};
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::helpers::{declarators, has_modifier, modifiers};
use crate::java::types::expr::Binding;
use tree_sitter::Node;

const MESSAGE: &str = "Implementing a functional interface is unnecessary; prefer to implement the functional interface method directly and use a method reference instead.";

fn lower_camel(name: &str) -> String {
    let mut out = String::new();
    for (index, word) in name.split('_').enumerate() {
        if index == 0 {
            out.push_str(&word.to_lowercase());
        } else {
            let mut letters = word.chars();
            if let Some(first) = letters.next() {
                out.extend(first.to_uppercase());
                out.push_str(&letters.as_str().to_lowercase());
            }
        }
    }
    out
}

fn is_use(context: &Context, node: Node, owner: &str, name: &str) -> bool {
    match node.kind() {
        "identifier" => {
            let Some(up) = parent(node) else { return false };
            let skipped = match up.kind() {
                "method_invocation" => up.child_by_field_name("name") == Some(node),
                "field_access" => up.child_by_field_name("field") == Some(node),
                "variable_declarator" | "formal_parameter" | "method_declaration" | "class_declaration" => up.child_by_field_name("name") == Some(node),
                _ => false,
            };
            !skipped && context.text(node) == name && matches!(context.resolver.binding(node, name), Some(Binding::Field(_, declaring, field)) if declaring.name == owner && field.name == name)
        }
        "field_access" => {
            node.child_by_field_name("field").is_some_and(|field| context.text(field) == name)
                && super::lookup::field_of(context, node).is_some_and(|(declaring, field)| declaring.name == owner && field.name == name)
        }
        _ => false,
    }
}

/// The replacement for one use, or `None` when something other than the method is used on the field.
fn use_edit(context: &Context, node: Node, new_name: &str, is_static: bool, owner: &str) -> Option<(usize, usize, String)> {
    let up = parent(node)?;
    if up.kind() == "method_invocation" && up.child_by_field_name("object") == Some(node) || up.kind() == "field_access" && up.child_by_field_name("object") == Some(node) {
        let abstract_method = up.kind() == "method_invocation" && context.resolver.resolve_call(up).is_some_and(|resolved| resolved.method.is_abstract);
        if !abstract_method {
            return None;
        }
        let start = match node.kind() {
            "identifier" => node.start_byte(),
            _ => node.child_by_field_name("object").map_or(node.start_byte(), |object| object.end_byte()),
        };
        let end = up.child_by_field_name("name").map_or(up.end_byte(), |name| name.end_byte());
        return Some((start, end, new_name.to_string()));
    }
    let class = if is_static { owner.rsplit('.').next().unwrap_or(owner).to_string() } else { "this".to_string() };
    Some((node.start_byte(), node.end_byte(), format!("{class}::{new_name}")))
}

pub fn unnecessary_anonymous_class(context: &Context, declaration: Node) {
    if declaration.kind() != "field_declaration" {
        return;
    }
    let list = declarators(declaration);
    let [declarator] = list.as_slice() else { return };
    let (Some(name), Some(value)) = (declarator.child_by_field_name("name"), declarator.child_by_field_name("value")) else { return };
    if value.kind() != "object_creation_expression" {
        return;
    }
    let Some(body) = children(value).into_iter().find(|part| part.kind() == "class_body") else { return };
    let members: Vec<Node> = named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let [implementation] = members.as_slice() else { return };
    if implementation.kind() != "method_declaration" || !effectively_private(declaration) || !has_modifier(declaration, "final") {
        return;
    }
    let Some(kind) = declaration.child_by_field_name("type").and_then(|written| context.resolver.type_node(written)) else { return };
    let index = context.resolver.index;
    let Some((functional_owner, functional)) = index.functional_method(&kind.erased().name()) else { return };
    let Some(method_name) = implementation.child_by_field_name("name") else { return };
    if context.text(method_name) != functional.name {
        return;
    }
    let Some((origin, declared)) = declared_method(context, *implementation) else { return };
    if !super_methods(index, origin, declared).iter().any(|(owner, above)| owner.name == functional_owner.name && above.name == functional.name) {
        return;
    }
    if super::hierarchy::annotation_names(context, declaration).iter().any(|written| context.resolver.class_name(declaration, written).as_deref() == Some("org.mockito.Spy")) {
        return;
    }
    let is_static = has_modifier(declaration, "static");
    let variable = context.text(name);
    let new_name = if is_static { lower_camel(variable) } else { variable.to_string() };
    let mut fix = Fix::replace(method_name.start_byte(), method_name.end_byte(), new_name.clone());
    fix = remove_modifiers(fix, declaration, &["final"]);
    let method_modifiers_end = modifiers(*implementation).map_or(implementation.start_byte(), |part| part.end_byte());
    let variable_modifiers_end = modifiers(declaration).map_or(0, |part| part.end_byte()) + 1;
    fix = fix.and(variable_modifiers_end, method_modifiers_end, "").and(implementation.end_byte(), declaration.end_byte(), "");
    let Some(owner) = super::fix_helpers::owner_class(context, declaration) else { return };
    let mut edits = Vec::new();
    let mut failed = false;
    walk(context.file.tree.root_node(), |node| {
        if failed || !is_use(context, node, &owner, variable) {
            return;
        }
        match use_edit(context, node, &new_name, is_static, &owner) {
            Some(edit) => edits.push(edit),
            None => failed = true,
        }
    });
    if failed {
        return;
    }
    let Some(block) = implementation.child_by_field_name("body") else { return };
    let (block_start, block_end) = (block.start_byte(), block.end_byte());
    let mut text = context.text(block).to_string();
    edits.sort_by_key(|edit| std::cmp::Reverse(edit.0));
    let mut separate = Vec::new();
    for (start, end, replacement) in edits {
        if start <= block_end && block_start <= end {
            text.replace_range(start.saturating_sub(block_start)..end.saturating_sub(block_start), &replacement);
        } else {
            separate.push((start, end, replacement));
        }
    }
    for (start, end, replacement) in separate {
        fix = fix.and(start, end, replacement);
    }
    fix = fix.and(block_start, block_end, text);
    context.report_fixed("UnnecessaryAnonymousClass", *declarator, name.start_byte(), MESSAGE, &[fix]);
}
