//! CollectionUndefinedEquality: a collection looked up with a type whose `equals` says nothing useful.
use super::Context;
use super::positions::arguments;
use crate::java::types::model::Type;
use tree_sitter::Node;

/// Where the checked types sit: the class that declares the method, the type argument of it that the argument must fit, the name and the parameters.
const DIRECT: &[(&str, usize, &str, &[&str])] = &[
    ("java.util.Collection", 0, "contains", &["java.lang.Object"]),
    ("java.util.Collection", 0, "remove", &["java.lang.Object"]),
    ("java.util.Deque", 0, "removeFirstOccurrence", &["java.lang.Object"]),
    ("java.util.Deque", 0, "removeLastOccurrence", &["java.lang.Object"]),
    ("java.util.Dictionary", 0, "get", &["java.lang.Object"]),
    ("java.util.Dictionary", 0, "remove", &["java.lang.Object"]),
    ("java.util.List", 0, "indexOf", &["java.lang.Object"]),
    ("java.util.List", 0, "lastIndexOf", &["java.lang.Object"]),
    ("java.util.Map", 0, "containsKey", &["java.lang.Object"]),
    ("java.util.Map", 1, "containsValue", &["java.lang.Object"]),
    ("java.util.Map", 0, "get", &["java.lang.Object"]),
    ("java.util.Map", 0, "getOrDefault", &["java.lang.Object", "java.lang.Object"]),
    ("java.util.Map", 0, "remove", &["java.lang.Object"]),
    ("java.util.Stack", 0, "search", &["java.lang.Object"]),
    ("java.util.Vector", 0, "indexOf", &["java.lang.Object", "int"]),
    ("java.util.Vector", 0, "lastIndexOf", &["java.lang.Object", "int"]),
    ("java.util.Vector", 0, "removeElement", &["java.lang.Object"]),
];
const OF_ARGUMENT: [&str; 3] = ["containsAll", "removeAll", "retainAll"];
const NOT_DEPENDING: [&str; 4] = ["java.util.IdentityHashMap", "java.util.IdentityHashSet", "java.util.SortedMap", "java.util.SortedSet"];

const TYPES: &[(&str, &[&str])] = &[
    ("CharSequence", &["java.lang.CharSequence"]),
    ("Collection", &["java.util.Collection"]),
    ("Date", &["java.util.Date"]),
    ("Future", &["java.util.concurrent.Future", "java.util.concurrent.CompletableFuture", "com.google.common.util.concurrent.ListenableFuture", "com.google.common.util.concurrent.SettableFuture"]),
    ("ImmutableCollection", &["com.google.common.collect.ImmutableCollection"]),
    ("ImmutableMultimap", &["com.google.common.collect.ImmutableMultimap"]),
    ("Iterable", &["com.google.common.collect.FluentIterable", "java.lang.Iterable"]),
    ("LongSparseArray", &["android.support.v4.util.LongSparseArrayCompat", "android.util.LongSparseArray", "androidx.collection.LongSparseArrayCompat", "androidx.core.util.LongSparseArrayCompat"]),
    ("Multimap", &["com.google.common.collect.Multimap"]),
    ("Queue", &["java.util.Queue"]),
    ("SparseArray", &["android.util.SparseArray", "androidx.collection.SparseArrayCompat"]),
];

fn type_argument(context: &Context, kind: &Type, owner: &str, at: usize) -> Option<Type> {
    context.resolver.index.arguments_as(kind, owner)?.into_iter().nth(at)
}

fn match_types(context: &Context, call: Node) -> Option<(Type, Type)> {
    let resolved = context.resolver.resolve_call(call)?;
    let index = context.resolver.index;
    let list = arguments(call);
    let parameters: Vec<String> = resolved.method.parameters.iter().map(Type::name).collect();
    if resolved.method.is_static {
        let (owner, collection) = match (resolved.declaring.as_str(), resolved.method.name.as_str()) {
            ("java.util.Collections", "disjoint") => ("java.util.Collections", "java.util.Collection"),
            ("com.google.common.collect.Sets", "difference") => ("com.google.common.collect.Sets", "java.util.Set"),
            _ => return None,
        };
        let _ = owner;
        let source = type_argument(context, &context.resolver.type_of(*list.first()?)?, collection, 0)?;
        let target = type_argument(context, &context.resolver.type_of(*list.get(1)?)?, collection, 0)?;
        return Some((source, target));
    }
    call.child_by_field_name("object")?;
    let receiver = &resolved.receiver;
    let receiver_name = receiver.erased().name();
    for (owner, at, name, formals) in DIRECT {
        if resolved.method.name == *name && parameters == *formals && index.is_subtype(&receiver_name, owner) {
            let source = context.resolver.type_of(*list.first()?)?;
            return Some((source, type_argument(context, receiver, owner, *at)?));
        }
    }
    if OF_ARGUMENT.contains(&resolved.method.name.as_str()) && parameters == ["java.util.Collection"] && index.is_subtype(&receiver_name, "java.util.Collection") {
        let source = type_argument(context, &context.resolver.type_of(*list.first()?)?, "java.util.Collection", 0)?;
        return Some((source, type_argument(context, receiver, "java.util.Collection", 0)?));
    }
    None
}

pub fn collection_undefined_equality(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let named = call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    let listed = DIRECT.iter().any(|(_, _, name, _)| *name == named) || OF_ARGUMENT.contains(&named) || matches!(named, "disjoint" | "difference");
    if !listed {
        return;
    }
    let Some((source, target)) = match_types(context, call) else { return };
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    let receiver = resolved.receiver.erased().name();
    if NOT_DEPENDING.iter().any(|owner| context.resolver.index.is_subtype(&receiver, owner)) {
        return;
    }
    let same = |kind: &Type, names: &[&str]| matches!(kind, Type::Class(name, _) if names.contains(&name.as_str()));
    let Some((short, _)) = TYPES.iter().find(|(_, names)| same(&source, names) || same(&target, names)) else { return };
    let message = format!("{short} does not have well-defined equals behavior.");
    context.report_fixed("CollectionUndefinedEquality", call, super::positions::preferred(context, call), &message, &[]);
}
