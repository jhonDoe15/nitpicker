//! The places where Lombok rewrites code the programmer wrote in a way the engine does not model: Error Prone's checks
//! see the rewritten trees there, so a run sends such files to Error Prone instead of guessing. Lombok adds members as
//! well; those come from the build's class files (`types::compiled`) and are not listed here.
use super::Context;
use super::javadoc::comment_before;
use crate::engine::source::{ancestor, children, parent, walk};
use crate::java::helpers::modifiers;
use tree_sitter::Node;

/// One use of a rewriting feature: where it is written and its name.
pub struct Rewrite {
    pub at: usize,
    pub feature: &'static str,
}

/// Annotations whose handler rewrites the written code around them, by the name Lombok gives them.
const REWRITING: &[(&str, &str)] = &[
    ("lombok.SneakyThrows", "SneakyThrows"),
    ("lombok.Cleanup", "Cleanup"),
    ("lombok.Synchronized", "Synchronized"),
    ("lombok.Locked", "Locked"),
    ("lombok.Locked.Read", "Locked"),
    ("lombok.Locked.Write", "Locked"),
    ("lombok.experimental.ExtensionMethod", "ExtensionMethod"),
    ("lombok.experimental.Helper", "Helper"),
    ("lombok.Builder.Default", "Builder.Default"),
];
/// Annotations that make Lombok write accessors whose doc comment it takes from the field's, rewriting the field's.
const ACCESSORS: &[&str] = &[
    "lombok.Getter", "lombok.Setter", "lombok.Data", "lombok.Value", "lombok.experimental.Value", "lombok.With",
    "lombok.experimental.Wither", "lombok.experimental.WithBy", "lombok.Builder", "lombok.experimental.SuperBuilder",
];
/// Other Lombok annotations this module looks at: `NonNull`, and the ones that take `onX` arguments.
const OTHERS: &[&str] = &[
    "lombok.NonNull", "lombok.AllArgsConstructor", "lombok.NoArgsConstructor", "lombok.RequiredArgsConstructor",
    "lombok.EqualsAndHashCode",
];
const ON_X: &[&str] = &["onMethod", "onMethod_", "onParam", "onParam_", "onConstructor", "onConstructor_"];
const TYPES: &[&str] = &["class_declaration", "enum_declaration", "record_declaration", "interface_declaration"];

/// The full name of an annotation as written: resolved through the file's imports; a written name stands for itself
/// when nothing resolves it.
fn full_name(context: &Context, annotation: Node) -> Option<String> {
    let written = context.text(annotation.child_by_field_name("name")?);
    let resolved = context.resolver.class_name(annotation, written).map(|name| name.replace('$', "."));
    if let Some(name) = resolved.filter(|name| name.starts_with("lombok.")) {
        return Some(name);
    }
    let mut segments = written.split('.');
    let first = segments.next()?;
    let rest: Vec<&str> = segments.collect();
    let outer = match context.resolver.scope.single.get(first) {
        Some(imported) => imported.clone(),
        None if written.starts_with("lombok.") => return Some(written.to_string()),
        None => on_demand(context, first),
    };
    Some(std::iter::once(outer.as_str()).chain(rest).collect::<Vec<_>>().join("."))
}

/// What a simple name stands for through Lombok's on-demand and static imports: a Lombok annotation this module
/// knows, else the name in the `lombok` package when any import reaches into Lombok (a guess that can only list more).
fn on_demand(context: &Context, first: &str) -> String {
    let scope = &context.resolver.scope;
    let lombok = |owner: &&String| owner.starts_with("lombok");
    let statics = scope.static_single.get(first).into_iter().flatten().filter(lombok);
    let wide = scope.on_demand.iter().chain(&scope.static_on_demand).filter(lombok);
    let owners: Vec<&String> = statics.chain(wide).collect();
    let known = |name: &String| {
        let name = name.as_str();
        REWRITING.iter().any(|(full, _)| *full == name) || ACCESSORS.contains(&name) || OTHERS.contains(&name)
    };
    let candidates: Vec<String> = owners.iter().map(|owner| format!("{owner}.{first}")).collect();
    match candidates.iter().find(|name| known(name)) {
        Some(name) => name.clone(),
        None if !candidates.is_empty() => format!("lombok.{first}"),
        None => first.to_string(),
    }
}

fn annotations(node: Node) -> Vec<Node> {
    let parts = modifiers(node).map(children).unwrap_or_default();
    parts.into_iter().filter(|part| matches!(part.kind(), "marker_annotation" | "annotation")).collect()
}

/// Whether the annotation names one of `names`.
fn named(context: &Context, annotation: Node, names: &[&str]) -> bool {
    full_name(context, annotation).is_some_and(|name| names.contains(&name.as_str()))
}

/// The argument names of an annotation: `onMethod_ = ...` gives `onMethod_`.
fn argument_names(context: &Context, annotation: Node) -> Vec<String> {
    let Some(list) = annotation.child_by_field_name("arguments") else { return Vec::new() };
    let pairs = children(list).into_iter().filter(|part| part.kind() == "element_value_pair");
    pairs.filter_map(|pair| pair.child_by_field_name("key")).map(|key| context.text(key).to_string()).collect()
}

fn lazy(context: &Context, annotation: Node) -> bool {
    let Some(list) = annotation.child_by_field_name("arguments") else { return false };
    let pairs = children(list).into_iter().filter(|part| part.kind() == "element_value_pair");
    let lazy = pairs.filter(|pair| pair.child_by_field_name("key").is_some_and(|key| context.text(key) == "lazy"));
    lazy.filter_map(|pair| pair.child_by_field_name("value")).any(|value| context.text(value) != "false")
}

/// A field with a doc comment that gets an accessor: Lombok copies the comment and rewrites the field's own.
fn documented_accessor_field(context: &Context, field: Node) -> bool {
    if comment_before(context, field).is_none() {
        return false;
    }
    let asks = |node: Node| annotations(node).into_iter().any(|annotation| named(context, annotation, ACCESSORS));
    let class = parent(field).and_then(parent).filter(|class| TYPES.contains(&class.kind()));
    asks(field) || class.is_some_and(asks)
}

/// Every place in the file where Lombok rewrites written code that the engine does not model.
pub fn rewrites(context: &Context, root: Node) -> Vec<Rewrite> {
    let mut found = Vec::new();
    walk(root, |node| match node.kind() {
        "marker_annotation" | "annotation" => {
            let Some(name) = full_name(context, node) else { return };
            if let Some((_, feature)) = REWRITING.iter().find(|(full, _)| *full == name) {
                found.push(Rewrite { at: node.start_byte(), feature });
            }
            if !name.starts_with("lombok.") {
                return;
            }
            if name == "lombok.NonNull" && ancestor(node, &["formal_parameter", "spread_parameter"]).is_some() {
                found.push(Rewrite { at: node.start_byte(), feature: "NonNull" });
            }
            if name == "lombok.Getter" && lazy(context, node) {
                found.push(Rewrite { at: node.start_byte(), feature: "Getter(lazy)" });
            }
            if argument_names(context, node).iter().any(|key| ON_X.contains(&key.as_str())) {
                found.push(Rewrite { at: node.start_byte(), feature: "onX" });
            }
        }
        "local_variable_declaration" | "enhanced_for_statement" => {
            let written = node.child_by_field_name("type").map(|kind| context.text(kind));
            let lombok = |written: &str| ["val", "var"].iter().any(|name| context.resolver.lombok_name(written, name));
            let inferred = context.resolver.index.lombok && written.is_some_and(lombok);
            if inferred && modifiers(node).is_some_and(|list| list.child_count() > 0) {
                found.push(Rewrite { at: node.start_byte(), feature: "val" });
            }
        }
        "field_declaration" if documented_accessor_field(context, node) => {
            found.push(Rewrite { at: node.start_byte(), feature: "Javadoc" });
        }
        _ => {}
    });
    found
}
