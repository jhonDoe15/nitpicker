//! InlineMeValidator: an `@InlineMe` annotation must fit the method's body. A body that cannot be inlined gets a fix
//! that removes the annotation; a replacement or import list that differs from what Error Prone infers from the body
//! gets the annotation Error Prone would write. Only `@InlineMeValidationDisabled` turns the check off: it does not
//! read `@SuppressWarnings`.
mod data;
mod inlinability;
mod sym;
mod tokens;
mod tree;

use super::Context;
use super::fixes::Fix;
use super::nodes::name_position;
use crate::engine::source::parent;
use crate::java::javac::locals::Scopes;
use tree_sitter::Node;

const CHECK: &str = "InlineMeValidator";
const DISABLED: &str = "com.google.errorprone.annotations.InlineMeValidationDisabled";

/// A declaration around the node, or the node itself, carries `@InlineMeValidationDisabled`.
fn disabled(context: &Context, node: Node) -> bool {
    let mut current = Some(node);
    while let Some(at) = current {
        if super::DECLARATIONS.contains(&at.kind()) && context.resolver.annotation_names(at).iter().any(|name| name == DISABLED) {
            return true;
        }
        current = parent(at);
    }
    false
}

fn mismatch(inferred: &data::Data, written: &data::Data) -> Option<String> {
    let set = |names: &[String]| names.iter().cloned().collect::<std::collections::BTreeSet<String>>();
    let shown = |names: &[String]| format!("[{}]", names.join(", "));
    let mut message = String::new();
    if !tokens::equivalent(&written.replacement, &inferred.replacement) {
        message.push_str(&format!("\nReplacement text: \n  InferredFromBody: {}\n  FromAnnotation: {}", inferred.replacement, written.replacement));
    }
    if set(&inferred.imports) != set(&written.imports) {
        message.push_str(&format!("\nImports: \n  InferredFromBody: {}\n  FromAnnotation: {}", shown(&inferred.imports), shown(&written.imports)));
    }
    if set(&inferred.static_imports) != set(&written.static_imports) {
        message.push_str(&format!("\nStatic imports: \n  InferredFromBody: {}\n  FromAnnotation: {}", shown(&inferred.static_imports), shown(&written.static_imports)));
    }
    (!message.is_empty()).then(|| format!("There is a mismatch between the implementation of the method and the replacement suggested in the annotation.{message}"))
}

pub fn inline_me_validator(context: &Context, method: Node) {
    if !matches!(method.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" | "annotation_type_element_declaration") {
        return;
    }
    let Some((annotation, written)) = data::from_declaration(context, method) else { return };
    if disabled(context, method) {
        return;
    }
    let scopes = Scopes::of(context.file, context.file.tree.root_node());
    let at = name_position(method);
    match inlinability::for_method(context, &scopes, method) {
        Err(failure) => {
            let fix = Fix::new().delete(annotation.start_byte(), annotation.end_byte());
            context.report_always_fixed(CHECK, at, &failure.message(), &[fix]);
        }
        Ok(body) => {
            let inferred = data::expected(context, &scopes, method, body);
            if let Some(message) = mismatch(&inferred, &written) {
                let fix = Fix::replace(annotation.start_byte(), annotation.end_byte(), inferred.annotation());
                context.report_always_fixed(CHECK, at, &message, &[fix]);
            }
        }
    }
}
