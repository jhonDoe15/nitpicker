//! ScopeOnModule and PrivateConstructorForNoninstantiableModule.
use super::Context;
use super::fixes::Fix;
use super::guice::{annotations, has_annotation};
use super::nodes::class_position;
use crate::engine::source::children;
use crate::java::helpers::has_modifier;
use tree_sitter::Node;

const MODULES: [&str; 2] = ["dagger.Module", "dagger.producers.ProducerModule"];
const BINDING_DECLARATIONS: [&str; 2] = ["dagger.Binds", "dagger.multibindings.Multibinds"];
const SCOPE: &str = "javax.inject.Scope";

fn is_type_declaration(node: Node) -> bool {
    matches!(node.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration")
}

pub fn scope_on_module(context: &Context, node: Node) {
    if !is_type_declaration(node) || !has_annotation(context, node, &MODULES) {
        return;
    }
    let index = context.resolver.index;
    let fixes: Vec<Fix> = annotations(context, node)
        .into_iter()
        .filter(|(_, name)| index.get(name).is_some_and(|info| info.class_annotations.iter().any(|found| found == SCOPE)))
        .map(|(annotation, _)| Fix::new().delete(annotation.start_byte(), annotation.end_byte()))
        .collect();
    if !fixes.is_empty() {
        context.report_fixed("ScopeOnModule", node, class_position(node), "Scopes on modules have no function and will soon be an error.", &fixes);
    }
}

/// The members of a class body as javac lists them: a field declaration with several names is several members.
fn members<'t>(body: Node<'t>) -> Vec<Node<'t>> {
    children(body).into_iter().filter(|member| member.is_named() && !member.kind().ends_with("comment") && member.kind() != ";").collect()
}

fn is_static_member(member: Node) -> bool {
    match member.kind() {
        "enum_declaration" | "interface_declaration" | "record_declaration" | "annotation_type_declaration" => true,
        _ => has_modifier(member, "static"),
    }
}

pub fn private_constructor_for_noninstantiable_module(context: &Context, node: Node) {
    if node.kind() != "class_declaration" || !has_annotation(context, node, &MODULES) {
        return;
    }
    let Some(body) = node.child_by_field_name("body") else { return };
    let members = members(body);
    if members.is_empty() || members.iter().any(|member| matches!(member.kind(), "constructor_declaration" | "compact_constructor_declaration" | "static_initializer" | "block")) {
        return;
    }
    let binds = members.iter().any(|member| has_annotation(context, *member, &BINDING_DECLARATIONS));
    let statics = members.iter().all(|member| is_static_member(*member));
    if !binds && !statics {
        return;
    }
    let Some(name) = node.child_by_field_name("name") else { return };
    let at = node.end_byte() - 1;
    let fix = Fix::replace(at, at, format!("\n\nprivate {}() {{}}\n", context.text(name)));
    context.report_fixed("PrivateConstructorForNoninstantiableModule", node, class_position(node), "Add a private constructor to modules that will not be instantiated by Dagger.", &[fix]);
}
