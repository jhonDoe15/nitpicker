//! PackageInfo, RecordAccessorInCompactConstructor and ShouldHaveEvenArgs.
use super::fixes::Fix;
use super::parts::{arguments, preferred};
use super::shape::{class_keyword, is_class};
use super::Context;
use crate::engine::source::{ancestor, children, parent};
use crate::java::types::model::Type;
use tree_sitter::Node;

/// Declaring types in `package-info.java` is flagged at the first of them, and Error Prone reports it twice: javac
/// analyzes a `package-info.java` with types in it as two units.
pub fn package_info(context: &Context, root: Node) {
    let path = context.file.path.replace('\\', "/");
    if path.rsplit('/').next() != Some("package-info.java") {
        return;
    }
    if let Some(first) = children(root).into_iter().find(|part| is_class(*part)) {
        for _ in 0..2 {
            context.report_always("PackageInfo", class_keyword(first), "Declaring types inside package-info.java files is very bad form");
        }
    }
}

pub fn record_accessor_in_compact_constructor(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !arguments(node).is_empty() {
        return;
    }
    let Some(method) = ancestor(node, &["method_declaration", "constructor_declaration", "compact_constructor_declaration"]) else { return };
    if method.kind() != "compact_constructor_declaration" || ancestor(node, &["lambda_expression"]).is_some() {
        return;
    }
    let Some(record) = parent(method).and_then(parent).filter(|owner| owner.kind() == "record_declaration") else { return };
    let Some(name) = node.child_by_field_name("name").map(|name| context.text(name)) else { return };
    if node.child_by_field_name("object").is_some_and(|object| object.kind() != "this") {
        return;
    }
    let Some(class) = context.resolver.scope.names.get(&record.id()) else { return };
    let Some(call) = context.resolver.resolve_call(node) else { return };
    if call.declaring != *class || !call.method.parameters.is_empty() || call.method.is_static {
        return;
    }
    if !record_component_named(context, record, name) {
        return;
    }
    let message = "Record accessors inside compact constructors read uninitialized fields (JLS §8.10.4.2). Use the parameter directly.";
    context.report_fixed("RecordAccessorInCompactConstructor", node, preferred(node), message, &[Fix::replace(node.start_byte(), node.end_byte(), name)]);
}

/// Whether the record header declares a component of that name.
fn record_component_named(context: &Context, record: Node, name: &str) -> bool {
    let Some(parameters) = record.child_by_field_name("parameters") else { return false };
    children(parameters).into_iter().filter(|part| part.kind() == "formal_parameter").any(|part| part.child_by_field_name("name").is_some_and(|found| context.text(found) == name))
}

const EVEN_OWNERS: [&str; 4] = [
    "com.google.common.truth.MapSubject",
    "com.google.common.truth.MapSubject.UsingCorrespondence",
    "com.google.common.truth.MultimapSubject",
    "com.google.common.truth.MultimapSubject.UsingCorrespondence",
];

pub fn should_have_even_args(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || node.child_by_field_name("name").is_none_or(|name| context.text(name) != "containsExactly") {
        return;
    }
    let args = arguments(node);
    if args.len() % 2 == 0 || !EVEN_OWNERS.iter().any(|owner| context.resolver.matches_sig(node, &format!("{owner}#containsExactly(_*)"))) {
        return;
    }
    let Some(call) = context.resolver.resolve_call(node) else { return };
    let Some(Type::Array(varargs)) = call.method.parameters.last().filter(|_| call.method.varargs) else { return };
    let last = args.last().and_then(|last| context.resolver.type_of(*last));
    if args.len() == call.method.parameters.len() && last.is_some_and(|kind| kind.erased() == Type::Array(varargs.clone()).erased()) {
        return;
    }
    context.report_fixed("ShouldHaveEvenArgs", node, preferred(node), "This method must be called with an even number of arguments.", &[]);
}
