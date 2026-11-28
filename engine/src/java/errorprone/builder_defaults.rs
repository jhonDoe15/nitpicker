//! AutoValueBuilderDefaultsInConstructor: defaults of an AutoValue builder are set in its constructor.
use super::Context;
use super::fixes::Fix;
use super::guice::annotations;
use super::junit_init::enclosing_class;
use super::nodes::name_position;
use crate::engine::source::{named_children, walk};
use crate::java::types::model::Type;
use tree_sitter::Node;

fn invocation_source(context: &Context, class: &str, statement: Node) -> Option<String> {
    let call = named_children(statement).into_iter().find(|part| !part.kind().ends_with("comment")).filter(|part| part.kind() == "method_invocation")?;
    let resolved = context.resolver.resolve_call(call)?;
    if resolved.declaring != class || !resolved.method.is_abstract {
        return None;
    }
    let text = context.text(call);
    Some(text.strip_prefix("this.").unwrap_or(text).to_string())
}

pub fn auto_value_builder_defaults_in_constructor(context: &Context, constructor: Node) {
    if constructor.kind() != "constructor_declaration" {
        return;
    }
    let Some(class) = enclosing_class(constructor).filter(|class| class.kind() != "object_creation_expression") else { return };
    if !annotations(context, class).iter().any(|(_, name)| name == "com.google.auto.value.AutoValue.Builder") {
        return;
    }
    let Some(class_name) = context.resolver.scope.names.get(&class.id()) else { return };
    let Some(body) = constructor.child_by_field_name("body") else { return };
    let invocations: Vec<String> = named_children(body)
        .into_iter()
        .filter(|statement| statement.kind() == "expression_statement")
        .filter_map(|statement| invocation_source(context, class_name, statement))
        .collect();
    if invocations.is_empty() {
        return;
    }
    let setters = format!(".{}", invocations.join("."));
    let mut fix = Fix::new().delete(constructor.start_byte(), constructor.end_byte());
    walk(context.file.tree.root_node(), |node| {
        if node.kind() == "object_creation_expression" && matches!(context.resolver.type_of(node), Some(Type::Class(name, _)) if context.resolver.index.is_subtype(&name, class_name)) {
            fix = std::mem::take(&mut fix).insert(node.end_byte(), setters.clone());
        }
    });
    context.report_fixed("AutoValueBuilderDefaultsInConstructor", constructor, name_position(constructor), "Defaults for AutoValue Builders should be set in the factory method returning Builder instances, not the constructor", &[fix]);
}
