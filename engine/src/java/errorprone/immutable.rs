//! ImmutableEnumChecker: an enum, or the body of an enum constant, with a field that can change or that holds
//! something that can. The check is off when `@Immutable` is not among the classes of the project, as it is for
//! Error Prone. It runs the analysis shared with `ImmutableAnnotationChecker`.
use super::Context;
use crate::java::types::model::flag;
use tree_sitter::Node;

pub mod classes;
pub mod enclosing;
pub mod entry;
pub mod safety;
pub mod vars;
pub mod written;

const NAME: &str = "ImmutableEnumChecker";

pub fn immutable_enum_checker(context: &Context, node: Node) {
    let index = context.resolver.index;
    let body = match node.kind() {
        "enum_declaration" | "enum_constant" => node.child_by_field_name("body"),
        _ => return,
    };
    if body.is_none() || !index.has(flag::IMMUTABLE_NAME) {
        return;
    }
    let reporter = classes::Reporter { check: NAME, names: &[NAME, "Immutable"], describe: &|why| format!("enums should be immutable: {why}") };
    if reporter.quiet(context, node) {
        return;
    }
    let Some(name) = classes::declaration_name(context, node) else { return };
    let Some(info) = index.get(&name) else { return };
    if node.kind() == "enum_declaration" {
        let exempt = info.interfaces.iter().any(|above| safety::annotated(context, above));
        if safety::annotated(context, &name) && !exempt {
            entry::report_annotated(context, &reporter, node, "enums are immutable by default; annotating them with @com.google.errorprone.annotations.Immutable is unnecessary");
        }
    }
    if let Some(why) = classes::for_type(context, &reporter, Some(node), &name, &classes::own_type(info), &[]) {
        reporter.report(context, node, classes::keyword(node), &why, &[]);
    }
}
