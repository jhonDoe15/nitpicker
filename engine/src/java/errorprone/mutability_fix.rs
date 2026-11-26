//! The fixes MixedMutabilityReturnType suggests: return immutable copies, or build the result with a builder.
use super::Context;
use super::fixes::Fix;
use super::fix_helpers::qualify_type;
use super::throws::can_be_overridden;
use super::vars::{Named, named};
use crate::engine::source::{parent, walk};
use crate::java::types::model::Type;
use tree_sitter::Node;

struct Details {
    matches: fn(&Context, &Type) -> bool,
    immutable: &'static str,
    appenders: [&'static str; 2],
    owner: &'static str,
    skip: &'static str,
}

fn under(context: &Context, kind: &Type, above: &str) -> bool {
    matches!(kind, Type::Class(..)) && context.resolver.index.is_subtype(&kind.erased().name(), above)
}

const DETAILS: [Details; 4] = [
    Details {
        matches: |context, kind| under(context, kind, "com.google.common.collect.BiMap"),
        immutable: "com.google.common.collect.ImmutableBiMap",
        appenders: ["put", "putAll"],
        owner: "com.google.common.collect.BiMap",
        skip: "",
    },
    Details {
        matches: |context, kind| under(context, kind, "java.util.Map") && !under(context, kind, "com.google.common.collect.BiMap"),
        immutable: "com.google.common.collect.ImmutableMap",
        appenders: ["put", "putAll"],
        owner: "java.util.Map",
        skip: "java.util.SortedMap",
    },
    Details {
        matches: |context, kind| under(context, kind, "java.util.List"),
        immutable: "com.google.common.collect.ImmutableList",
        appenders: ["add", "addAll"],
        owner: "java.util.List",
        skip: "",
    },
    Details {
        matches: |context, kind| under(context, kind, "java.util.Set"),
        immutable: "com.google.common.collect.ImmutableSet",
        appenders: ["add", "addAll"],
        owner: "java.util.Set",
        skip: "",
    },
];

fn erased_tree(written: Node) -> Node {
    if written.kind() == "generic_type" { written.named_child(0).unwrap_or(written) } else { written }
}

fn copy_of(context: &Context, expression: Node, details: &Details) -> Fix {
    let mut fix = Fix::new();
    let class = qualify_type(context, expression, details.immutable, &mut fix);
    fix.and(expression.start_byte(), expression.end_byte(), format!("{class}.copyOf({})", context.text(expression)))
}

fn empty_initializer(context: &Context, value: Node) -> bool {
    match value.kind() {
        "object_creation_expression" => {
            let plain = value.child_by_field_name("arguments").is_none_or(|list| list.named_child_count() == 0);
            let class = value.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind)).map(|kind| kind.name());
            plain && matches!(class.as_deref(), Some("java.util.ArrayList" | "java.util.HashMap")) && value.child_by_field_name("body").is_none()
        }
        "method_invocation" => {
            ["com.google.common.collect.Lists#newArrayList()", "com.google.common.collect.Lists#newLinkedList()", "com.google.common.collect.Sets#newHashSet()", "com.google.common.collect.Sets#newLinkedHashSet()"]
                .iter()
                .any(|signature| context.resolver.matches_sig(value, signature))
        }
        _ => false,
    }
}

fn appends(context: &Context, call: Node, details: &Details) -> bool {
    let named = call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    details.appenders.contains(&named)
        && context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static && context.resolver.index.is_subtype(&resolved.receiver.erased().name(), details.owner))
}

/// Turns the local variable into a builder, when everything done to it allows that; `None` when it does not.
fn builder_fix(context: &Context, method: Node, declarator: Node, details: &Details) -> Option<Fix> {
    let name = context.text(declarator.child_by_field_name("name")?);
    let mut fix = Fix::new();
    let mut failed = false;
    let mut turned = false;
    walk(method, |part| {
        if failed {
            return;
        }
        if part.id() == declarator.id() {
            let value = part.child_by_field_name("value");
            let skipped = value.and_then(|value| context.resolver.type_of(value)).is_some_and(|kind| !details.skip.is_empty() && under(context, &kind, details.skip));
            if value.is_none_or(|value| !empty_initializer(context, value)) || skipped {
                failed = true;
                return;
            }
            let declaration = parent(part);
            let written = declaration.and_then(|declaration| declaration.child_by_field_name("type"));
            if let Some(written) = written.filter(|written| context.text(*written) != "var") {
                let builder = format!("{}.Builder", details.immutable);
                let shown = qualify_type(context, part, &builder, &mut fix);
                fix = std::mem::take(&mut fix).and(erased_tree(written).start_byte(), erased_tree(written).end_byte(), shown);
            }
            if let Some(value) = value {
                let class = qualify_type(context, part, details.immutable, &mut fix);
                fix = std::mem::take(&mut fix).and(value.start_byte(), value.end_byte(), format!("{class}.builder()"));
            }
            turned = true;
            return;
        }
        if part.kind() != "identifier" || context.text(part) != name || !matches!(named(context, part), Some(Named::Variable(found)) if found.id() == declarator.id()) {
            return;
        }
        let Some(holder) = parent(part) else { return };
        if holder.kind() == "method_invocation" && holder.child_by_field_name("object") == Some(part) {
            failed |= !appends(context, holder, details);
        } else if holder.kind() == "field_access" && holder.child_by_field_name("object") == Some(part) {
        } else if !turned {
            failed = true;
        } else if holder.kind() == "return_statement" {
            fix = std::mem::take(&mut fix).insert(part.end_byte(), ".build()");
        }
    });
    (!failed).then_some(fix)
}

/// The details of the first kind of collection the method returns, or none.
fn details_of<'a>(context: &Context, method: Node) -> Option<&'a Details> {
    let kind = method.child_by_field_name("type").and_then(|written| context.resolver.type_node(written))?;
    DETAILS.iter().find(|details| (details.matches)(context, &kind))
}

/// The fixes for a method with the values it returns, mutable ones first.
pub fn fixes(context: &Context, method: Node, values: &[Node]) -> Vec<Fix> {
    let Some(details) = details_of(context, method) else { return Vec::new() };
    let (mut simple, mut with_builders) = (Fix::new(), Fix::new());
    if !can_be_overridden(method) {
        if let Some(written) = method.child_by_field_name("type") {
            let mut fix = Fix::new();
            let class = qualify_type(context, method, details.immutable, &mut fix);
            let fix = fix.and(erased_tree(written).start_byte(), erased_tree(written).end_byte(), class);
            simple = simple.merged((fix).clone());
            with_builders = with_builders.merged((fix).clone());
        }
    }
    let mut any_builder = false;
    for value in values {
        let kind = context.resolver.type_of(*value);
        if kind.as_ref().is_some_and(|kind| under(context, kind, details.immutable)) {
            break;
        }
        let Some(entry) = DETAILS.iter().find(|entry| kind.as_ref().is_some_and(|kind| (entry.matches)(context, kind))) else { continue };
        let plain = copy_of(context, *value, entry);
        if value.kind() == "identifier" {
            let built = match named(context, *value) {
                Some(Named::Variable(declarator)) => builder_fix(context, method, declarator, entry),
                _ => None,
            };
            any_builder |= built.is_some();
            simple = simple.merged((plain).clone());
            with_builders = with_builders.merged(built.as_ref().unwrap_or(&plain).clone());
            continue;
        }
        let factory = value.kind() == "method_invocation"
            && value.child_by_field_name("name").is_some_and(|name| ["emptyList", "emptyMap", "emptySet", "singleton", "singletonList"].contains(&context.text(name)))
            && context.resolver.resolve_call(*value).is_some_and(|call| call.method.is_static && call.declaring == "java.util.Collections");
        if factory {
            let mut fix = Fix::new();
            let class = qualify_type(context, *value, entry.immutable, &mut fix);
            let select_end = value.child_by_field_name("name").map_or(value.end_byte(), |name| name.end_byte());
            let fix = fix.and(value.start_byte(), select_end, format!("{class}.of"));
            simple = simple.merged((fix).clone());
            with_builders = with_builders.merged((fix).clone());
            continue;
        }
        simple = simple.merged((plain).clone());
        with_builders = with_builders.merged((plain).clone());
    }
    if any_builder { vec![simple, with_builders] } else { vec![simple] }
}
