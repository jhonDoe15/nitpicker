//! DMI_ANNOTATION_IS_NOT_VISIBLE_TO_REFLECTION, measured on test code: `isAnnotationPresent(X.class)` written
//! against a class (any class with such a method, not an interface such as `AnnotatedElement`) where `X` lacks
//! `@Retention(RUNTIME)`; the class literal may sit in a local or both arms of `?:`. Not `getAnnotation` and its
//! relatives. Priority 1, once per method and annotation; placed on the called method, its full name without
//! `java.lang.`, its shown name without `java.lang.` for a class of that package itself or else the current package.
use super::super::super::Context;
use super::super::super::idioms::encoding::written_owner;
use super::super::super::names;
use super::super::found::{Found, Findings};
use super::super::numbers::values::local_value;
use super::randoms::{arguments, call_line};
use crate::java::types::expr::unwrap;
use crate::java::types::model::{Type, flag};
use tree_sitter::Node;

pub const PATTERN: &str = "DMI_ANNOTATION_IS_NOT_VISIBLE_TO_REFLECTION";

/// The class a class literal names, also through a local or `?:` naming one class on both sides.
fn literal(context: &Context, node: Node, depth: usize) -> Option<String> {
    let node = unwrap(node);
    if depth > 4 {
        return None;
    }
    match node.kind() {
        "class_literal" => match context.resolver.type_of(node)? {
            Type::Class(_, arguments) => match arguments.as_slice() {
                [Type::Class(named, _)] => Some(named.clone()),
                _ => None,
            },
            _ => None,
        },
        "ternary_expression" => {
            let yes = literal(context, node.child_by_field_name("consequence")?, depth + 1)?;
            (literal(context, node.child_by_field_name("alternative")?, depth + 1)? == yes).then_some(yes)
        }
        _ => literal(context, local_value(context, node)?, depth + 1),
    }
}

pub fn check<'a>(context: &Context<'a>, own: &str, node: Node<'a>, label: &str, found: &mut Findings<'a>) {
    if node.kind() != "method_invocation" || !context.wants(&[PATTERN]) {
        return;
    }
    if node.child_by_field_name("name").is_none_or(|name| context.text(name) != "isAnnotationPresent") {
        return;
    }
    let [argument] = arguments(node)[..] else { return };
    if context.resolver.resolve_call(node).is_none_or(|call| call.method.is_static || call.method.parameters.len() != 1) {
        return;
    }
    let Some(owner) = written_owner(context, own, node) else { return };
    if context.resolver.index.get(&owner).is_none_or(|info| info.is_interface) {
        return;
    }
    let Some(annotation) = literal(context, argument, 0) else { return };
    let Some(info) = context.resolver.index.get(&annotation) else { return };
    if info.flags & flag::RUNTIME_RETENTION != 0 {
        return;
    }
    let shown = names::binary(context, &annotation);
    let binary = names::binary(context, &owner);
    let package = names::package_of(&names::binary(context, own)).to_string();
    let qualified = binary.strip_prefix("java.lang.").unwrap_or(&binary);
    let local = binary.strip_prefix(&format!("{package}.")).filter(|_| !package.is_empty());
    let lang = binary.strip_prefix("java.lang.").filter(|rest| !rest.contains('.'));
    let class = lang.or(local).unwrap_or(&binary);
    let message = format!("Use of reflection to check for the presence the annotation {shown} which doesn't have runtime retention, in {label}");
    let place = Some(format!("function:{qualified}.isAnnotationPresent(Class)|{package}@{class}.isAnnotationPresent(Class)"));
    found.add(Found { pattern: PATTERN, node, line: call_line(context, node), priority: 1, message, place, arguments: vec![shown, label.to_string()] });
}
