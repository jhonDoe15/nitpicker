//! BugPatternNaming: `@BugPattern(name = ...)` that differs from, or repeats, the name of the check class.
use super::Context;
use super::annotation_args::{annotation_arguments, annotation_value};
use super::consts::{Const, constant};
use super::fixes::Fix;
use super::inject_checks::{annotation_class, annotations_of};
use super::nodes::class_position;
use crate::java::types::scope::enclosing_type;
use tree_sitter::Node;

const BUG_PATTERN: &str = "com.google.errorprone.BugPattern";
const BUG_CHECKER: &str = "com.google.errorprone.bugpatterns.BugChecker";

/// `SuggestedFixes.removeElement` for one argument of an annotation.
fn remove_element(element: Node, all: &[Node]) -> Fix {
    let Some(at) = all.iter().position(|part| *part == element) else { return Fix::new() };
    if all.len() == 1 {
        return Fix::replace(element.start_byte(), element.end_byte(), "");
    }
    if at + 1 == all.len() {
        return Fix::replace(all[at - 1].end_byte(), element.end_byte(), "");
    }
    Fix::replace(element.start_byte(), all[at + 1].start_byte(), "")
}

pub fn bug_pattern_naming(context: &Context, class: Node) {
    if class.kind() != "class_declaration" {
        return;
    }
    let Some(name_node) = class.child_by_field_name("name") else { return };
    let Some(declared) = enclosing_type(context.file, context.resolver.scope, class) else { return };
    if !context.resolver.index.is_subtype(&declared, BUG_CHECKER) {
        return;
    }
    let Some(annotation) = annotations_of(class).into_iter().find(|annotation| annotation_class(context, *annotation).as_deref() == Some(BUG_PATTERN)) else { return };
    let Some(value) = annotation_value(&context.file.text, annotation, "name") else { return };
    let Some(Const::Str(name)) = constant(context, value) else { return };
    if name.is_empty() {
        return;
    }
    let message = "Giving BugPatterns a name different to the enclosing class can be confusing";
    if context.text(name_node) != name {
        return context.report_fixed("BugPatternNaming", class, class_position(class), message, &[]);
    }
    let all = annotation_arguments(annotation);
    let Some(element) = all.iter().copied().find(|argument| argument.kind() == "element_value_pair" && argument.child_by_field_name("key").is_some_and(|key| context.text(key) == "name")) else { return };
    let message = "Setting @BugPattern.name to the class name of the check is redundant";
    context.report_fixed("BugPatternNaming", annotation, annotation.start_byte(), message, &[remove_element(element, &all)]);
}
