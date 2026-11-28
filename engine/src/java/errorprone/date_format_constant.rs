//! DateFormatConstant: a `DateFormat` kept in a constant field.
use super::Context;
use super::nodes::name_position;
use super::renames::{Use, rename_variable, variable_uses};
use crate::engine::source::parent;
use crate::java::helpers::has_modifier;
use crate::java::types::model::Type;
use tree_sitter::Node;

/// `CaseFormat.UPPER_UNDERSCORE.to(CaseFormat.LOWER_CAMEL, name)`.
fn lower_camel(name: &str) -> String {
    let mut words = name.split('_');
    let mut out: String = words.next().unwrap_or_default().to_ascii_lowercase();
    for word in words {
        let mut chars = word.chars();
        if let Some(first) = chars.next() {
            out.push(first.to_ascii_uppercase());
            out.push_str(&chars.as_str().to_ascii_lowercase());
        }
    }
    out
}

fn static_final(declaration: Node) -> bool {
    declaration.kind() == "constant_declaration" || (has_modifier(declaration, "static") && has_modifier(declaration, "final"))
}

pub fn date_format_constant(context: &Context, declarator: Node) {
    if declarator.kind() != "variable_declarator" {
        return;
    }
    let Some(declaration) = parent(declarator).filter(|holder| matches!(holder.kind(), "field_declaration" | "constant_declaration")) else { return };
    let (Some(name_node), Some(initializer), Some(written)) =
        (declarator.child_by_field_name("name"), declarator.child_by_field_name("value"), declaration.child_by_field_name("type"))
    else {
        return;
    };
    let name = context.text(name_node);
    if !static_final(declaration) || name != name.to_ascii_uppercase() {
        return;
    }
    let Some(Type::Class(class, _)) = context.resolver.declared_type(declaration, Some(declarator)).map(|kind| kind.erased()) else { return };
    if class != "java.text.DateFormat" && !context.resolver.index.is_subtype(&class, "java.text.DateFormat") {
        return;
    }
    let root = context.file.tree.root_node();
    let renamed = lower_camel(name);
    let mut thread_local = rename_variable(context, root, declarator, name_node, &renamed)
        .and(written.start_byte(), written.end_byte(), format!("ThreadLocal<{}>", context.text(written)))
        .insert(initializer.start_byte(), "ThreadLocal.withInitial(() -> ")
        .insert(initializer.end_byte(), ")");
    for usage in variable_uses(context, root, declarator, name_node) {
        if let Use::Name(identifier) = usage {
            thread_local = thread_local.insert(identifier.end_byte(), ".get()");
        }
    }
    let rename = rename_variable(context, root, declarator, name_node, &renamed);
    let message = "DateFormat is not thread-safe, and should not be used as a constant field.";
    context.report_fixed("DateFormatConstant", declarator, name_position(declarator), message, &[thread_local, rename]);
}
