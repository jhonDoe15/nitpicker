//! AutoValueFinalMethods and AutoValueImmutableFields: checks on the methods of `@AutoValue` classes.
use super::Context;
use super::equals_methods::{equals_declaration, formals, hash_code_declaration, is_public, name_of};
use super::fix_helpers::add_modifiers;
use super::fixes::Fix;
use super::members::members;
use super::nodes::name_position;
use super::shape::suppressed_any;
use crate::java::helpers::has_modifier;
use crate::java::types::model::Type;
use tree_sitter::Node;

const AUTO_VALUE: &str = "com.google.auto.value.AutoValue";
const MEMOIZED: &str = "com.google.auto.value.extension.memoized.Memoized";

fn auto_value_class(context: &Context, class: Node) -> bool {
    matches!(class.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration")
        && context.resolver.annotation_names(class).iter().any(|name| name == AUTO_VALUE)
}

fn methods<'t>(class: Node<'t>) -> Vec<Node<'t>> {
    let Some(body) = class.child_by_field_name("body") else { return Vec::new() };
    members(body).into_iter().filter(|member| member.kind() == "method_declaration").collect()
}

/// The abstract flag the tree carries: written, or implied for an interface method without a body.
fn is_abstract(method: Node) -> bool {
    has_modifier(method, "abstract") || (crate::engine::source::parent(method).is_some_and(|body| body.kind() == "interface_body") && method.child_by_field_name("body").is_none())
}

fn to_string_declaration(context: &Context, method: Node) -> bool {
    name_of(context, method) == "toString"
        && is_public(method)
        && formals(method).is_empty()
        && method.child_by_field_name("type").and_then(|kind| context.resolver.written(kind, true)).is_some_and(|kind| kind.erased() == Type::class("java.lang.String"))
}

pub fn auto_value_final_methods(context: &Context, class: Node) {
    if !auto_value_class(context, class) {
        return;
    }
    let mut candidates: Vec<Node> = Vec::new();
    for method in methods(class) {
        let matches = has_modifier(method, "public")
            && !is_abstract(method)
            && !has_modifier(method, "final")
            && !context.resolver.annotation_names(method).iter().any(|name| name == MEMOIZED)
            && (equals_declaration(context, method) || to_string_declaration(context, method) || hash_code_declaration(context, method));
        if matches && !context.suppressed("AutoValueFinalMethods", method) && !candidates.iter().any(|seen| seen.id() == method.id()) {
            candidates.push(method);
        }
    }
    let Some(first) = candidates.first() else { return };
    let mut fix = Fix::new();
    for method in &candidates {
        fix = add_modifiers(fix, *method, &["final"]);
    }
    let names: Vec<&str> = candidates.iter().map(|method| name_of(context, *method)).collect();
    let message = format!("Make {} final in AutoValue classes, so it is clear to readers that AutoValue is not overriding them", names.join(", "));
    context.report_fixed("AutoValueFinalMethods", *first, name_position(*first), &message, &[fix]);
}

const REPLACEMENTS: &[(&str, &[&str])] = &[
    ("ImmutableCollection", &["java.util.Collection"]),
    ("ImmutableList", &["java.util.List", "java.util.ArrayList", "java.util.LinkedList", "com.google.common.collect.ImmutableList.Builder"]),
    ("ImmutableMap", &["java.util.Map", "java.util.HashMap", "java.util.LinkedHashMap", "com.google.common.collect.ImmutableMap.Builder"]),
    ("ImmutableSortedMap", &["java.util.SortedMap", "java.util.TreeMap", "com.google.common.collect.ImmutableSortedMap.Builder"]),
    ("ImmutableBiMap", &["com.google.common.collect.BiMap", "com.google.common.collect.ImmutableBiMap.Builder"]),
    ("ImmutableSet", &["java.util.Set", "java.util.HashSet", "java.util.LinkedHashSet", "com.google.common.collect.ImmutableSet.Builder"]),
    ("ImmutableSortedSet", &["java.util.SortedSet", "java.util.TreeSet", "com.google.common.collect.ImmutableSortedSet.Builder"]),
    ("ImmutableMultimap", &["com.google.common.collect.Multimap", "com.google.common.collect.ImmutableMultimap.Builder"]),
    ("ImmutableListMultimap", &["com.google.common.collect.ListMultimap", "com.google.common.collect.ImmutableListMultimap.Builder"]),
    ("ImmutableSetMultimap", &["com.google.common.collect.SetMultimap", "com.google.common.collect.ImmutableSetMultimap.Builder"]),
    ("ImmutableMultiset", &["com.google.common.collect.Multiset", "com.google.common.collect.ImmutableMultiset.Builder"]),
    ("ImmutableSortedMultiset", &["com.google.common.collect.SortedMultiset", "com.google.common.collect.ImmutableSortedMultiset.Builder"]),
    ("ImmutableTable", &["com.google.common.collect.Table", "com.google.common.collect.ImmutableTable.Builder"]),
    ("ImmutableRangeMap", &["com.google.common.collect.RangeMap", "com.google.common.collect.ImmutableRangeMap.Builder"]),
    ("ImmutableRangeSet", &["com.google.common.collect.RangeSet", "com.google.common.collect.ImmutableRangeSet.Builder"]),
    ("ImmutablePrefixTrie", &["com.google.common.collect.PrefixTrie", "com.google.common.collect.ImmutablePrefixTrie.Builder"]),
];

pub fn auto_value_immutable_fields(context: &Context, class: Node) {
    const NAMES: [&str; 2] = ["AutoValueImmutableFields", "mutable"];
    if !auto_value_class(context, class) || suppressed_any(context, &NAMES, class) {
        return;
    }
    for method in methods(class) {
        if !is_abstract(method) || suppressed_any(context, &NAMES, method) {
            continue;
        }
        let Some(returned) = method.child_by_field_name("type").and_then(|kind| context.resolver.written(kind, true)) else { continue };
        let returned = returned.erased();
        let dimensions = method.child_by_field_name("dimensions").is_some();
        for (replacement, types) in REPLACEMENTS {
            let array = *replacement == "ImmutableList" && (dimensions || matches!(returned, Type::Array(_)));
            if array || (!dimensions && matches!(&returned, Type::Class(name, _) if types.contains(&name.as_str()))) {
                let message = format!("AutoValue instances should be deeply immutable. Therefore, we recommend returning {replacement} instead.");
                context.report_fixed("AutoValueImmutableFields", method, name_position(method), &message, &[]);
            }
        }
    }
}
