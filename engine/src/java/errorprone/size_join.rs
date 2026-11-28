//! StringJoin, SizeGreaterThanOrEqualsZero, ThrowIfUncheckedKnownChecked and PreconditionsInvalidPlaceholder.
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::owners::{is_descendant, receiver_name};
use super::parts::{arguments, preferred};
use super::shape::constant_text;
use super::Context;
use crate::engine::source::{children, named_children, parent};
use crate::java::javac::locals::{declaration, Found, Scopes};
use crate::java::types::model::Type;
use regex::Regex;
use std::sync::OnceLock;
use tree_sitter::Node;

const SIZE_CLASSES: [&str; 18] = [
    "android.util.LongSparseArray",
    "android.util.LruCache",
    "android.util.SparseArray",
    "android.util.SparseBooleanArray",
    "android.util.SparseIntArray",
    "android.util.SparseLongArray",
    "androidx.collection.CircularArray",
    "androidx.collection.CircularIntArray",
    "androidx.collection.LongSparseArray",
    "androidx.collection.LruCache",
    "androidx.collection.SimpleArrayMap",
    "androidx.collection.SparseArrayCompat",
    "com.google.common.collect.FluentIterable",
    "com.google.common.collect.Multimap",
    "java.io.ByteArrayOutputStream",
    "java.util.Collection",
    "java.util.Dictionary",
    "java.util.Map",
];
const LENGTH_CLASSES: [&str; 5] = ["java.util.BitSet", "java.lang.CharSequence", "java.lang.String", "java.lang.StringBuilder", "java.lang.StringBuffer"];
const WITH_IS_EMPTY: [&str; 11] = [
    "androidx.collection.CircularArray",
    "androidx.collection.CircularIntArray",
    "androidx.collection.SimpleArrayMap",
    "com.google.common.collect.FluentIterable",
    "com.google.common.collect.Multimap",
    "java.util.Collection",
    "java.util.Dictionary",
    "java.util.Map",
    "java.util.BitSet",
    "java.lang.String",
    "com.google.common.collect.Iterables",
];

pub fn string_join(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !static_on_class(context, node, "java.lang.String", &["join"]) {
        return;
    }
    let args = arguments(node);
    let replacement = match args.as_slice() {
        [_] => "\"\"".to_string(),
        [_, second] => {
            let is_text = matches!(context.resolver.type_of(*second), Some(Type::Class(name, _)) if context.resolver.index.is_subtype(&name, "java.lang.CharSequence"));
            if !is_text {
                return;
            }
            context.text(*second).to_string()
        }
        _ => return,
    };
    let fix = Fix::replace(node.start_byte(), node.end_byte(), replacement);
    let message = "String.join(CharSequence) performs no joining (it always returns the empty string); String.join(CharSequence, CharSequence) performs no joining (it just returns the 2nd parameter).";
    context.report_fixed("StringJoin", node, preferred(node), message, &[fix]);
}

/// The literal `0` as an int: decimal, hexadecimal, octal or binary, with underscores.
fn is_int_zero(context: &Context, node: Node) -> bool {
    if !matches!(node.kind(), "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal") {
        return false;
    }
    let text = context.text(node).replace('_', "");
    let digits = ["0x", "0X", "0b", "0B"].iter().find_map(|prefix| text.strip_prefix(prefix)).unwrap_or(&text);
    !digits.is_empty() && digits.chars().all(|digit| digit == '0')
}

fn has_is_empty(context: &Context, receiver: Option<Node>) -> bool {
    let Some(receiver) = receiver else { return false };
    match context.resolver.receiver(receiver) {
        Some(crate::java::types::expr::Receiver::Static(class)) => is_descendant(context, &class, &WITH_IS_EMPTY),
        Some(crate::java::types::expr::Receiver::Value(Type::Class(class, _))) => is_descendant(context, &class, &WITH_IS_EMPTY),
        _ => false,
    }
}

fn proto_count() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new("get([^\n\r\u{85}\u{2028}\u{2029}]+)Count").unwrap())
}

fn is_proto_count(context: &Context, call: Node) -> bool {
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return false };
    let Some(found) = name.strip_prefix("get").and_then(|rest| rest.strip_suffix("Count")).filter(|field| !field.is_empty()) else { return false };
    let Some(resolved) = context.resolver.resolve_call(call).filter(|resolved| !resolved.method.is_static && resolved.method.parameters.is_empty()) else { return false };
    let owner = if call.child_by_field_name("object").is_some() { resolved.receiver.erased().name() } else { resolved.declaring.clone() };
    context.resolver.index.is_subtype(&owner, "com.google.protobuf.GeneratedMessage")
        && context.resolver.index.get(&resolved.declaring).is_some_and(|class| class.methods.iter().any(|method| method.name == format!("get{found}List")))
}

pub fn size_greater_than_or_equals_zero(context: &Context, node: Node) {
    if node.kind() != "binary_expression" {
        return;
    }
    let (Some(operator), Some(left), Some(right)) = (node.child_by_field_name("operator"), node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
    let (greater, operand) = match operator.kind() {
        ">=" if is_int_zero(context, right) => (true, left),
        "<=" if is_int_zero(context, left) => (false, right),
        _ => return,
    };
    let fix = match operand.kind() {
        "method_invocation" => call_fix(context, node, operand, left, right, greater),
        "field_access" => (operand.child_by_field_name("field").is_some_and(|field| context.text(field) == "length")
            && matches!(operand.child_by_field_name("object").and_then(|object| context.resolver.type_of(object)), Some(Type::Array(_))))
        .then(|| remove_equals(context, node, left, right, greater)),
        _ => None,
    };
    if let Some(fix) = fix {
        let message = "Comparison of a size >= 0 is always true, did you intend to check for non-emptiness?";
        context.report_fixed("SizeGreaterThanOrEqualsZero", node, preferred(node), message, &[fix]);
    }
}

fn remove_equals(context: &Context, node: Node, left: Node, right: Node, greater: bool) -> Fix {
    let text = if greater { format!("{} > 0", context.text(left)) } else { format!("0 < {}", context.text(right)) };
    Fix::replace(node.start_byte(), node.end_byte(), text)
}

fn call_fix(context: &Context, node: Node, call: Node, left: Node, right: Node, greater: bool) -> Option<Fix> {
    let name = call.child_by_field_name("name").map(|name| context.text(name))?;
    let receiver = call.child_by_field_name("object");
    if matches!(name, "size" | "length") {
        if let Some(owner) = receiver_name(context, call, false) {
            let classes: &[&str] = if name == "size" { &SIZE_CLASSES } else { &LENGTH_CLASSES };
            if is_descendant(context, &owner, classes) {
                return Some(if has_is_empty(context, receiver) {
                    Fix::replace(node.start_byte(), node.end_byte(), format!("!{}.isEmpty()", context.text(receiver?)))
                } else {
                    remove_equals(context, node, left, right, greater)
                });
            }
        }
        if name == "size" && static_on_class(context, call, "com.google.common.collect.Iterables", &["size"]) {
            return Some(if has_is_empty(context, receiver) {
                let args: Vec<&str> = arguments(call).into_iter().map(|argument| context.text(argument)).collect();
                Fix::replace(node.start_byte(), node.end_byte(), format!("!{}.isEmpty({})", context.text(receiver?), args.join(",")))
            } else {
                remove_equals(context, node, left, right, greater)
            });
        }
    }
    if is_proto_count(context, call) {
        let source = context.text(call);
        let found = proto_count().captures(source)?;
        let replaced = proto_count().replacen(source, 1, format!("get{}List", &found[1]));
        return Some(Fix::replace(node.start_byte(), node.end_byte(), format!("!{replaced}.isEmpty()")));
    }
    None
}

fn is_known_checked(context: &Context, kind: &Type) -> bool {
    let Type::Class(name, _) = kind.erased() else { return false };
    let index = context.resolver.index;
    name != "java.lang.Exception" && index.is_subtype(&name, "java.lang.Exception") && !index.is_subtype(&name, "java.lang.RuntimeException")
}

/// The alternatives of a multi-catch parameter that the expression names.
fn union_alternatives(context: &Context, expression: Node) -> Option<Vec<Type>> {
    if expression.kind() != "identifier" {
        return None;
    }
    let scopes = Scopes::of(context.file, context.file.tree.root_node());
    let Some(Found::Local(declared)) = declaration(context.resolver, &scopes, expression, context.text(expression)) else { return None };
    if declared.kind() != "catch_formal_parameter" {
        return None;
    }
    let types = children(declared).into_iter().find(|part| part.kind() == "catch_type")?;
    let written: Vec<Node> = named_children(types).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    if written.len() < 2 {
        return None;
    }
    written.into_iter().map(|part| context.resolver.type_node(part)).collect()
}

pub fn throw_if_unchecked_known_checked(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !static_on_class(context, node, "com.google.common.base.Throwables", &["throwIfUnchecked", "propagateIfPossible"]) {
        return;
    }
    let args = arguments(node);
    let [argument] = args.as_slice() else { return };
    let alternatives = union_alternatives(context, *argument);
    let known = match alternatives {
        Some(kinds) => kinds.iter().all(|kind| is_known_checked(context, kind)),
        None => context.resolver.type_of(*argument).is_some_and(|kind| is_known_checked(context, &kind)),
    };
    if !known {
        return;
    }
    let mut statement = parent(node);
    while let Some(up) = statement.filter(|up| up.kind() == "argument_list") {
        statement = parent(up).and_then(parent);
    }
    let fix = statement.map(|up| Fix::replace(up.start_byte(), up.end_byte(), "")).unwrap_or_default();
    context.report_fixed("ThrowIfUncheckedKnownChecked", node, preferred(node), "throwIfUnchecked(knownCheckedException) is a no-op.", &[fix]);
}

fn bad_placeholder() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(r"\$s|%(?:[0-9]+\$)??[dbBhHScCoxXeEfgGaAtTn]|\{[0-9]+\}").unwrap())
}

fn expected_arguments(format: &str) -> usize {
    format.matches("%s").count()
}

pub fn preconditions_invalid_placeholder(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(node) else { return };
    let owner = if node.child_by_field_name("object").is_some() { resolved.receiver.erased().name() } else { resolved.declaring.clone() };
    if !resolved.method.is_static || !matches!(owner.as_str(), "com.google.common.base.Preconditions" | "com.google.common.base.Verify") {
        return;
    }
    if !matches!(resolved.method.parameters.get(1), Some(Type::Class(name, _)) if name == "java.lang.String") {
        return;
    }
    let args = arguments(node);
    let Some(format_tree) = args.get(1).copied().filter(|tree| super::shape::folded_strings(*tree)) else { return };
    let value = match format_tree.kind() {
        "string_literal" => crate::java::types::expr::literal_text(context.file, format_tree),
        _ => constant_text(context, format_tree),
    };
    let Some(value) = value else { return };
    if expected_arguments(&value) >= args.len() - 2 || !bad_placeholder().is_match(&value) {
        return;
    }
    let source = context.text(format_tree);
    let fixed = bad_placeholder().replace_all(source, "%s").into_owned();
    let message = "Preconditions only accepts the %s placeholder in error message strings";
    if expected_arguments(&fixed) == args.len() - 2 {
        let fix = Fix::replace(format_tree.start_byte(), format_tree.end_byte(), fixed);
        context.report_fixed("PreconditionsInvalidPlaceholder", format_tree, format_tree.start_byte(), message, &[fix]);
        return;
    }
    let missing = args.len() as isize - 2 - expected_arguments(&fixed) as isize;
    let mut builder = fixed;
    builder.pop();
    builder.push_str(" [%s");
    for _ in 1..missing {
        builder.push_str(", %s");
    }
    builder.push_str("]\"");
    let fix = Fix::replace(format_tree.start_byte(), format_tree.end_byte(), builder);
    context.report_fixed("PreconditionsInvalidPlaceholder", node, preferred(node), message, &[fix]);
}
