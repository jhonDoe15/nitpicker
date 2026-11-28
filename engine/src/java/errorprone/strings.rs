//! Checks on the charset names given to strings and on equality of types that have no useful `equals`.
use super::charsets;
use super::fixes::Fix;
use super::shape::{arguments, constant_text, preferred, qualify_type};
use super::values::value_name;
use super::Context;
use crate::engine::source::{parent, walk};
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_types;
use tree_sitter::Node;

const CHARSETS: &str = "java.nio.charset.StandardCharsets";

fn static_import_conflicts(context: &Context, at: Node, name: &str) -> bool {
    let qualified = format!("{CHARSETS}.{name}");
    let scope = context.resolver.scope;
    let imported = scope.static_single.get(name).is_some_and(|owners| owners.iter().any(|owner| owner == CHARSETS)) || scope.static_on_demand.iter().any(|owner| owner == CHARSETS);
    let index = context.resolver.index;
    for class in enclosing_types(scope, at) {
        let own = index.field(&class, name).is_some_and(|(info, _)| format!("{}.{name}", info.name) != qualified);
        if own || !index.methods(&class, name).is_empty() {
            return true;
        }
    }
    let mut conflict = false;
    walk(context.file.tree.root_node(), |node| {
        if conflict {
            return;
        }
        match node.kind() {
            "identifier" if context.text(node) == name => {
                let method_name = parent(node).is_some_and(|holder| holder.kind() == "method_invocation" && holder.child_by_field_name("object").is_none() && holder.child_by_field_name("name") == Some(node));
                conflict = (value_name(node) || method_name) && !imported;
            }
            "method_declaration" => conflict = node.child_by_field_name("name").is_some_and(|found| context.text(found) == name),
            _ => {}
        }
    });
    conflict
}

fn charset_fix(context: &Context, arg: Node, constant: &str) -> Fix {
    let name = if static_import_conflicts(context, arg, constant) {
        format!("{}.{constant}", qualify_type(context, arg, CHARSETS))
    } else {
        constant.to_string()
    };
    Fix::replace(arg.start_byte(), arg.end_byte(), name).with_imports()
}

pub fn string_charset(context: &Context, node: Node) {
    let arg = match node.kind() {
        "method_invocation" => {
            let args = arguments(node);
            let named = node.child_by_field_name("name").is_some_and(|name| context.text(name) == "getBytes");
            if !named || args.len() != 1 || !context.resolver.matches_sig(node, "java.lang.String#getBytes(java.lang.String)") {
                return;
            }
            if !node.child_by_field_name("object").is_some_and(|object| matches!(context.resolver.type_of(object), Some(Type::Class(name, _)) if name == "java.lang.String")) {
                return;
            }
            args[0]
        }
        "object_creation_expression" => {
            let args = arguments(node);
            if args.len() != 2 || node.child_by_field_name("type").is_none_or(|kind| !context.text(kind).ends_with("String")) {
                return;
            }
            let Some((call, formals)) = context.resolver.call_formals(node) else { return };
            let wanted = [Type::Array(Box::new(Type::Primitive("byte"))), Type::class("java.lang.String")];
            if call.declaring != "java.lang.String" || formals != wanted {
                return;
            }
            args[1]
        }
        _ => return,
    };
    let Some(value) = constant_text(context, arg) else { return };
    if !charsets::valid(&value) {
        context.report_fixed("StringCharset", arg, preferred(arg), &format!("{value} is not a valid charset"), &[]);
        return;
    }
    let Some(constant) = charsets::standard(&value) else { return };
    let fix = charset_fix(context, arg, constant);
    context.report_fixed("StringCharset", arg, preferred(arg), "Prefer StandardCharsets over using string names for charsets", &[fix]);
}

const UNDEFINED: &[(&str, &[&str])] = &[
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

fn undefined_kind(context: &Context, node: Option<Node>) -> Option<&'static str> {
    let Some(Type::Class(name, _)) = context.resolver.type_of(node?) else { return None };
    UNDEFINED.iter().find(|(_, names)| names.contains(&name.as_str())).map(|(short, _)| *short)
}

fn is_class(context: &Context, node: Option<Node>, wanted: &str) -> bool {
    node.is_some_and(|node| matches!(context.resolver.type_of(node), Some(Type::Class(name, _)) if name == wanted))
}

fn subtype_of(context: &Context, node: Option<Node>, wanted: &str) -> bool {
    node.is_some_and(|node| matches!(context.resolver.type_of(node), Some(Type::Class(name, _)) if context.resolver.index.is_subtype(&name, wanted)))
}

/// The two sides compared by a call that checks equality: the receiver, then the argument.
fn compared<'t>(context: &Context, call: Node<'t>) -> Option<(Option<Node<'t>>, Option<Node<'t>>)> {
    let name = context.text(call.child_by_field_name("name")?);
    let args = arguments(call);
    let resolver = context.resolver;
    let pair = |args: &[Node<'t>]| (args.len() >= 2).then(|| (Some(args[args.len() - 2]), Some(args[args.len() - 1])));
    match name {
        "equals" if resolver.matches_sig(call, "java.util.Objects#equals(java.lang.Object,java.lang.Object)") => return pair(&args),
        "equal" if resolver.matches_sig(call, "com.google.common.base.Objects#equal(java.lang.Object,java.lang.Object)") => return pair(&args),
        "assertEquals" | "assertNotEquals" => {
            if ["org.junit.Assert", "junit.framework.Assert", "junit.framework.TestCase"].iter().any(|owner| resolver.matches_sig(call, &format!("{owner}#{name}(_*)"))) {
                return pair(&args);
            }
        }
        _ => {}
    }
    if name == "equals" && args.len() == 1 {
        let resolved = resolver.resolve_call(call)?;
        if !resolved.method.is_static && resolved.method.parameters == [Type::class("java.lang.Object")] && resolved.method.returns == Type::Primitive("boolean") {
            return Some((call.child_by_field_name("object"), Some(args[0])));
        }
        return None;
    }
    if matches!(name, "isEqualTo" | "isNotEqualTo") && args.len() == 1 && resolver.matches_sig(call, &format!("com.google.common.truth.Subject#{name}(_)")) {
        let inner = call.child_by_field_name("object").filter(|object| object.kind() == "method_invocation")?;
        let that = resolver.matches_sig(inner, "com.google.common.truth.Truth#assertThat(_)") || resolver.matches_sig(inner, "com.google.common.truth.StandardSubjectBuilder#that(_)");
        let given = arguments(inner);
        return (that && given.len() == 1).then(|| (Some(args[0]), Some(given[0])));
    }
    None
}

fn undefined_fixes(context: &Context, call: Node, receiver: Option<Node>, argument: Option<Node>) -> Vec<Fix> {
    let name = call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    if name == "isEqualTo" {
        if let (Some(receiver), Some(argument), Some(object)) = (receiver, argument, call.child_by_field_name("object")) {
            let head = context.file.text[call.start_byte()..object.end_byte()].to_string();
            for (type_name, method) in [("java.lang.Iterable", "containsExactlyElementsIn"), ("com.google.common.collect.Multimap", "containsExactlyEntriesIn")] {
                if subtype_of(context, Some(argument), type_name) && subtype_of(context, Some(receiver), type_name) {
                    return vec![Fix::replace(call.start_byte(), call.end_byte(), format!("{head}.{method}({})", context.text(receiver)))];
                }
            }
        }
    }
    for (maybe, other) in [(receiver, argument), (argument, receiver)] {
        if is_class(context, maybe, "java.lang.CharSequence") && is_class(context, other, "java.lang.String") {
            let at = maybe.map_or(0, |node| node.end_byte());
            return vec![Fix::new().insert(at, ".toString()")];
        }
    }
    Vec::new()
}

pub fn undefined_equals(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let Some((receiver, argument)) = compared(context, node) else { return };
    let short = UNDEFINED.iter().map(|(short, _)| *short).find(|short| {
        [receiver, argument].iter().any(|side| undefined_kind(context, *side) == Some(*short))
    });
    let Some(short) = short else { return };
    let fixes = undefined_fixes(context, node, receiver, argument);
    context.report_fixed("UndefinedEquals", node, preferred(node), &format!("{short} does not have well-defined equality semantics"), &fixes);
}
