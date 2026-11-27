//! The matchers MissingFail runs on a try statement, from Error Prone's `MissingFail`.
use super::Context;
use super::call_match::static_on_class;
use crate::engine::source::{named_children, walk};
use crate::java::types::expr::Binding;
use crate::java::types::model::flag;
use tree_sitter::Node;

const ASSERTS: [&str; 3] = ["org.junit.Assert", "junit.framework.Assert", "junit.framework.TestCase"];

pub(super) fn called(context: &Context, node: Node) -> String {
    node.child_by_field_name("name").map(|name| context.text(name).to_string()).unwrap_or_default()
}

pub(super) fn on_asserts(context: &Context, call: Node, name: &str) -> bool {
    ASSERTS.iter().any(|owner| static_on_class(context, call, owner, &[name]))
}

pub(super) fn strip(mut node: Node) -> Node {
    while node.kind() == "parenthesized_expression" {
        let Some(inner) = node.named_child(0) else { break };
        node = inner;
    }
    node
}

/// `booleanLiteral(value)` or `booleanConstant(value)`.
pub(super) fn boolean(context: &Context, node: Node, value: bool) -> bool {
    let literal = if value { "true" } else { "false" };
    if node.kind() == literal {
        return true;
    }
    if node.kind() != "field_access" || node.child_by_field_name("field").is_none_or(|field| context.text(field) != literal.to_uppercase()) {
        return false;
    }
    let Some(object) = node.child_by_field_name("object") else { return false };
    let class = match context.resolver.receiver(object) {
        Some(crate::java::types::expr::Receiver::Static(class)) => class,
        Some(crate::java::types::expr::Receiver::Value(kind)) => kind.name(),
        None => return false,
    };
    let name = literal.to_uppercase();
    context.resolver.index.field(&class, &name).is_some_and(|(_, field)| {
        field.flags & flag::STATIC != 0 && matches!(field.kind.name().as_str(), "boolean" | "java.lang.Boolean")
    })
}

pub(super) fn any_argument(context: &Context, call: Node, test: &dyn Fn(Node) -> bool) -> bool {
    let _ = context;
    super::positions::arguments(call).into_iter().any(test)
}

pub(super) fn assert_with(context: &Context, call: Node, name: &str, value: bool) -> bool {
    on_asserts(context, call, name) && any_argument(context, call, &|argument| boolean(context, argument, value))
}

pub(super) fn int_value(context: &Context, node: Node) -> Option<i64> {
    if !matches!(node.kind(), "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal") {
        return None;
    }
    let text = context.text(node).replace('_', "");
    if text.ends_with(['l', 'L']) {
        return None;
    }
    let lower = text.to_lowercase();
    let value = if let Some(hex) = lower.strip_prefix("0x") {
        u32::from_str_radix(hex, 16).ok()? as i32 as i64
    } else if let Some(binary) = lower.strip_prefix("0b") {
        u32::from_str_radix(binary, 2).ok()? as i32 as i64
    } else if lower.len() > 1 && lower.starts_with('0') {
        u32::from_str_radix(&lower[1..], 8).ok()? as i32 as i64
    } else {
        lower.parse::<i64>().ok()?
    };
    Some(value)
}

/// `assertEquals` with two different `int` literals among its arguments.
pub(super) fn unequal(context: &Context, call: Node) -> bool {
    if !on_asserts(context, call, "assertEquals") {
        return false;
    }
    let mut seen: Vec<i64> = Vec::new();
    for argument in super::positions::arguments(call) {
        if let Some(value) = int_value(context, argument) {
            if !seen.contains(&value) {
                seen.push(value);
                if seen.len() > 1 {
                    return true;
                }
            }
        }
    }
    false
}

/// What `Matchers.contains` finds: a node below `root`, not `root` itself.
pub(super) fn contains(root: Node, test: &mut dyn FnMut(Node) -> bool) -> bool {
    let mut found = false;
    walk(root, |node| {
        if !found && node.id() != root.id() && test(node) {
            found = true;
        }
    });
    found
}

pub(super) fn assert_call(context: &Context, node: Node) -> bool {
    node.kind() == "method_invocation" && {
        let name = called(context, node);
        name.starts_with("assert") || name.starts_with("verify")
    }
}

pub(super) fn real_assert(context: &Context, node: Node) -> bool {
    assert_call(context, node) && !assert_with(context, node, "assertFalse", false) && !assert_with(context, node, "assertTrue", true)
}

pub(super) fn throw_or_fail(context: &Context, node: Node) -> bool {
    match node.kind() {
        "throw_statement" => true,
        "assert_statement" => node.named_child(0).is_some_and(|condition| boolean(context, strip(condition), false)),
        "method_invocation" => {
            assert_with(context, node, "assertTrue", false)
                || assert_with(context, node, "assertFalse", true)
                || unequal(context, node)
                || called(context, node).to_lowercase().contains("fail")
        }
        "method_reference" => node.child(node.child_count().saturating_sub(1)).is_some_and(|name| context.text(name).to_lowercase().contains("fail")),
        _ => false,
    }
}

pub(super) fn log_call(context: &Context, node: Node) -> bool {
    if node.kind() != "method_invocation" {
        return false;
    }
    let Some(resolved) = context.resolver.resolve_call(node) else { return false };
    if resolved.method.is_static {
        return false;
    }
    let simple = super::odd_calls::receiver_class(context, node).map(|class| class.rsplit(['.', '$']).next().unwrap_or_default().to_string());
    simple.is_some_and(|name| name.contains("Logger")) || called(context, node).starts_with("log")
}

pub(super) fn symbol_kind<'a>(context: &'a Context<'a>, node: Node) -> Option<Binding<'a>> {
    match node.kind() {
        "identifier" => context.resolver.binding(node, context.text(node)),
        _ => None,
    }
}

pub(super) fn instance_field(context: &Context, node: Node) -> bool {
    match node.kind() {
        "identifier" => matches!(symbol_kind(context, node), Some(Binding::Field(_, _, field)) if field.flags & flag::STATIC == 0),
        "field_access" => {
            let (Some(object), Some(field)) = (node.child_by_field_name("object"), node.child_by_field_name("field")) else { return false };
            let class = match object.kind() {
                "this" => crate::java::types::scope::enclosing_types(context.resolver.scope, node).into_iter().next(),
                _ => match context.resolver.receiver(object) {
                    Some(crate::java::types::expr::Receiver::Static(class)) => Some(class),
                    Some(crate::java::types::expr::Receiver::Value(kind)) => Some(kind.name()),
                    None => None,
                },
            };
            class.and_then(|class| context.resolver.index.field(&class, context.text(field)).map(|(_, found)| found.flags & flag::STATIC == 0)).unwrap_or(false)
        }
        _ => false,
    }
}

