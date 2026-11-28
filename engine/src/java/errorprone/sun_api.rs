//! SunApi: a name that stands for a package of the `jdk.unsupported` module, a class in one, or a member of such a
//! class, outside imports. javac gives a name the symbol of what it stands for: a package, a class, or a field or
//! method, whose package is the package of its class.
use super::Context;
use super::lookup::field_of;
use crate::engine::source::{children, parent};
use tree_sitter::Node;

/// The packages of the `jdk.unsupported` module (the same on JDK 21 to 27).
const PACKAGES: &[&str] = &["com.sun.nio.file", "sun.misc", "sun.reflect"];

enum Named {
    Package(String),
    Class(String),
    Member(String, String),
}

fn package_of(context: &Context, class: &str) -> String {
    context.resolver.index.get(class).map(|info| info.package.clone()).unwrap_or_default()
}

fn unsupported(context: &Context, named: &Named) -> Option<String> {
    let (package, shown) = match named {
        Named::Package(name) => (name.clone(), name.clone()),
        Named::Class(class) => (package_of(context, class), class.clone()),
        Named::Member(owner, name) => (package_of(context, owner), name.clone()),
    };
    PACKAGES.contains(&package.as_str()).then_some(shown)
}

/// What a simple name stands for.
fn simple(context: &Context, node: Node) -> Option<Named> {
    let text = context.text(node);
    if node.kind() == "identifier" && context.resolver.is_variable(node, text) {
        return field_of(context, node).map(|(owner, field)| Named::Member(owner.name.clone(), field.name.clone()));
    }
    match context.resolver.class_name(node, text).filter(|name| context.resolver.index.has(name)) {
        Some(class) => Some(Named::Class(class)),
        None => Some(Named::Package(text.to_string())),
    }
}

/// What a name or a dotted chain stands for.
fn named(context: &Context, node: Node) -> Option<Named> {
    match node.kind() {
        "identifier" | "type_identifier" => simple(context, node),
        "field_access" | "scoped_type_identifier" | "scoped_identifier" => {
            let inner = node.named_child(0)?;
            let last = node.child_by_field_name("field").or_else(|| node.child_by_field_name("name")).or_else(|| children(node).into_iter().rev().find(|part| part.kind() == "type_identifier"))?;
            let name = context.text(last);
            match named(context, inner) {
                Some(Named::Package(package)) => {
                    let joined = format!("{package}.{name}");
                    Some(if context.resolver.index.has(&joined) { Named::Class(joined) } else { Named::Package(joined) })
                }
                Some(Named::Class(class)) => {
                    let nested = format!("{class}.{name}");
                    Some(if context.resolver.index.has(&nested) { Named::Class(nested) } else { Named::Member(class, name.to_string()) })
                }
                _ => field_of(context, node).map(|(owner, field)| Named::Member(owner.name.clone(), field.name.clone())),
            }
        }
        _ => None,
    }
}

/// The `.` before the last name of a dotted node.
fn dot(node: Node) -> usize {
    children(node).into_iter().rev().find(|part| part.kind() == ".").map_or(node.start_byte(), |part| part.start_byte())
}

fn in_import(node: Node) -> bool {
    let mut current = parent(node);
    while let Some(at) = current {
        if matches!(at.kind(), "import_declaration" | "package_declaration") {
            return true;
        }
        current = parent(at);
    }
    false
}

/// Whether the node is a part of a larger name, which javac does not see as a tree of its own.
fn part_of_name(node: Node) -> bool {
    let Some(holder) = parent(node) else { return false };
    match holder.kind() {
        "field_access" => holder.child_by_field_name("field") == Some(node),
        "scoped_type_identifier" | "scoped_identifier" => holder.named_child(0) != Some(node),
        "method_invocation" => holder.child_by_field_name("name") == Some(node),
        _ => holder.child_by_field_name("name") == Some(node) && !matches!(holder.kind(), "marker_annotation" | "annotation"),
    }
}

fn report(context: &Context, matched: Node, offset: usize, named: Option<Named>) {
    if let Some(shown) = named.and_then(|named| unsupported(context, &named)) {
        let message = format!("{shown} is an internal JDK API which may be removed in a future release");
        context.report("SunApi", matched, offset, &message);
    }
}

pub fn sun_api(context: &Context, node: Node) {
    match node.kind() {
        "identifier" | "type_identifier" | "field_access" | "scoped_type_identifier" | "scoped_identifier" => {
            if part_of_name(node) || in_import(node) || context.text(node) == "var" {
                return;
            }
            let offset = if matches!(node.kind(), "identifier" | "type_identifier") { node.start_byte() } else { dot(node) };
            report(context, node, offset, named(context, node));
        }
        "method_invocation" => {
            let Some(name) = node.child_by_field_name("name") else { return };
            let Some(call) = context.resolver.resolve_call(node) else { return };
            let offset = if node.child_by_field_name("object").is_some() { dot_before(node, name) } else { name.start_byte() };
            report(context, node, offset, Some(Named::Member(call.declaring, context.text(name).to_string())));
        }
        "class_literal" => {
            let Some(kind) = node.named_child(0) else { return };
            let Some(Named::Class(class)) = named(context, kind) else { return };
            report(context, node, dot(node), Some(Named::Member(class, "class".to_string())));
        }
        _ => {}
    }
}

fn dot_before(call: Node, name: Node) -> usize {
    children(call).into_iter().filter(|part| part.kind() == "." && part.end_byte() <= name.start_byte()).last().map_or(name.start_byte(), |part| part.start_byte())
}
