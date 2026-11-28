//! The Naming patterns that fire on real code: NM_METHOD_NAMING_CONVENTION, NM_FIELD_NAMING_CONVENTION,
//! NM_CLASS_NOT_EXCEPTION, NM_SAME_SIMPLE_NAME_AS_SUPERCLASS and NM_SAME_SIMPLE_NAME_AS_INTERFACE.
//! Measured on test code:
//! - A method or field name is reported when its first letter is upper case, its second lower case and it has no
//!   `_`. A final field is never reported, nor a method of an interface or one named like its class. Public and
//!   protected members of a class whose class file is public are priority 2; others, members of an enum, and a
//!   method that overrides a concrete method of a superclass are priority 3, which `-medium` hides. When a part of
//!   the package name is a single character the class counts as public. A field has no line; a method sits on its
//!   first line of code.
//! - NM_CLASS_NOT_EXCEPTION: a class, enum or record whose binary name ends in `Exception` and that does not extend
//!   `java.lang.Exception`, unless a part of its package name is a single character. Priority 2.
//! - NM_SAME_SIMPLE_NAME_*: the binary name without the package equals that of the direct superclass (priority 1)
//!   or of a directly implemented interface (priority 2). The SARIF place is the supertype.
mod members;

use super::{Context, names, place};
use super::classes::lines;
use crate::java::types::model::OBJECT;
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

pub const PATTERNS: &[&str] = &[
    members::METHOD,
    members::FIELD,
    "NM_CLASS_NOT_EXCEPTION",
    "NM_SAME_SIMPLE_NAME_AS_SUPERCLASS",
    "NM_SAME_SIMPLE_NAME_AS_INTERFACE",
];

/// Whether a name breaks the convention the way SpotBugs tests it: upper case, then lower case, and no `_`.
pub fn badly_named(name: &str) -> bool {
    let mut letters = name.chars();
    let (Some(first), Some(second)) = (letters.next(), letters.next()) else { return false };
    first.is_uppercase() && second.is_lowercase() && !name.contains('_')
}

/// Whether a part of the class's package name is a single character, which changes how SpotBugs rates it.
pub fn short_package(binary: &str) -> bool {
    let package = names::package_of(binary);
    !package.is_empty() && package.split('.').any(|part| part.chars().count() == 1)
}

fn line_of(first: Option<usize>) -> usize {
    first.unwrap_or(0)
}

fn not_exception(context: &Context, own: &str, class: Node, binary: &str, first: Option<usize>) {
    let index = context.resolver.index;
    let kinds = ["class_declaration", "enum_declaration", "record_declaration"];
    if !kinds.contains(&class.kind()) || !names::short(binary).ends_with("Exception") || !index.complete(own) {
        return;
    }
    if short_package(binary) {
        return;
    }
    if index.is_subtype(own, "java.lang.Exception") {
        return;
    }
    let message = format!("Class {binary} is not derived from an Exception, even though it is named as such");
    context.report_listed("NM_CLASS_NOT_EXCEPTION", class, line_of(first), message, format!("type:{binary}"), 2, vec![binary.to_string()]);
}

fn shadows(context: &Context, own: &str, class: Node, binary: &str, first: Option<usize>) {
    let Some(info) = context.resolver.index.get(own) else { return };
    let package = names::package_of(binary);
    let report = |pattern: &'static str, above: &str, wording: &str, priority: u8| {
        let shown = names::binary(context, above);
        if names::short(&shown) != names::short(binary) || shown == binary {
            return;
        }
        let message = format!("The class name {binary} shadows the simple name of {wording} {shown}");
        let place = format!("type:{shown}|{package}");
        context.report_listed(pattern, class, line_of(first), message, place, priority, vec![binary.to_string(), shown]);
    };
    if !info.is_interface && class.kind() == "class_declaration" {
        report("NM_SAME_SIMPLE_NAME_AS_SUPERCLASS", info.superclass.as_deref().unwrap_or(OBJECT), "the superclass", 1);
    }
    for above in &info.interfaces {
        report("NM_SAME_SIMPLE_NAME_AS_INTERFACE", above, "implemented interface", 2);
    }
}

pub fn naming<'a>(context: &Context<'a>, class: Node<'a>) {
    if !context.wants(PATTERNS) {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { return };
    let named = TYPE_DECLARATIONS.contains(&class.kind());
    let body = class.child_by_field_name("body").or_else(|| crate::engine::source::children(class).into_iter().find(|part| part.kind() == "class_body"));
    let Some(body) = body else { return };
    let members = place::members(body);
    let binary = names::binary(context, &own);
    let first = lines::class_first(context, &own, class, &members);
    if named {
        not_exception(context, &own, class, &binary, first);
        shadows(context, &own, class, &binary, first);
    }
    members::check(context, &own, class, &members, &binary);
}
