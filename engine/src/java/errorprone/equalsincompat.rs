//! EqualsIncompatibleType: `equals` called on types that can never be equal.
use super::compat::{compatibility, pretty, qualified};
use super::parts::{arguments, enclosing_class, open_paren};
use super::target::target_type;
use super::Context;
use crate::engine::source::parent;
use crate::java::types::model::{Type, OBJECT};
use tree_sitter::Node;

const STATIC_EQUALS: [&str; 4] = [
    "android.support.v4.util.ObjectsCompat#equals(java.lang.Object,java.lang.Object)",
    "androidx.v4.util.ObjectsCompat#equals(java.lang.Object,java.lang.Object)",
    "java.util.Objects#equals(java.lang.Object,java.lang.Object)",
    "com.google.common.base.Objects#equal(java.lang.Object,java.lang.Object)",
];

fn receiver_of(context: &Context, call: Node) -> Option<Type> {
    if let Some(array) = call.child_by_field_name("object").and_then(|object| context.resolver.type_of(object)).filter(|kind| matches!(kind, Type::Array(_))) {
        return Some(array);
    }
    let resolved = context.resolver.resolve_call(call)?;
    let method = &resolved.method;
    if method.name != "equals" || method.is_static || method.parameters != [Type::class(OBJECT)] || method.returns != Type::Primitive("boolean") {
        return None;
    }
    if call.child_by_field_name("object").is_some() {
        return Some(resolved.receiver);
    }
    let owner = context.resolver.index.get(&resolved.declaring)?;
    Some(Type::Class(owner.name.clone(), owner.type_parameters.iter().map(|(name, _)| Type::Variable(name.clone())).collect()))
}

fn in_assert_false(call: Node, context: &Context) -> bool {
    let Some(list) = parent(call).filter(|list| list.kind() == "argument_list") else { return false };
    parent(list).is_some_and(|outer| outer.kind() == "method_invocation" && outer.child_by_field_name("name").is_some_and(|name| context.text(name) == "assertFalse"))
}

fn message(call: Node, context: &Context, receiver: &Type, argument: &Type, lhs: &Type, rhs: &Type) -> String {
    let name = call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or("equals");
    let strings = |first: &Type, second: &Type| {
        let (a, b) = (pretty(first), pretty(second));
        if a == b { (qualified(first), qualified(second)) } else { (a, b) }
    };
    let (a, b) = strings(receiver, argument);
    let base = format!("Calling {name} on incompatible types {a} and {b}");
    if receiver == lhs {
        return base;
    }
    let (c, d) = strings(lhs, rhs);
    format!("{base}. They are incompatible because {c} and {d} are incompatible.")
}

pub fn equals_incompatible_type(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let Some(name) = node.child_by_field_name("name").map(|name| context.text(name)) else { return };
    if !matches!(name, "equals" | "equal" | "isEqual") {
        return;
    }
    let list = arguments(node);
    let (receiver, argument) = if matches!(name, "equals" | "equal") && list.len() == 2 && STATIC_EQUALS.iter().any(|signature| context.resolver.matches_sig(node, signature)) {
        (context.resolver.type_of(list[0]), context.resolver.type_of(list[1]))
    } else if name == "equals" && list.len() == 1 {
        match receiver_of(context, node) {
            Some(receiver) => (Some(receiver), context.resolver.type_of(list[0])),
            None => return,
        }
    } else if name == "isEqual" && list.len() == 1 && context.resolver.matches_sig(node, "java.util.function.Predicate#isEqual(java.lang.Object)") {
        let Some(Type::Class(_, targets)) = target_type(context, node) else { return };
        let [only] = targets.as_slice() else { return };
        (context.resolver.type_of(list[0]), Some(only.clone()))
    } else {
        return;
    };
    let (Some(receiver), Some(argument)) = (receiver, argument) else { return };
    let Some(report) = compatibility(context, &receiver, &argument, &[], &[]) else { return };
    if in_assert_false(node, context) {
        return;
    }
    let text = format!("{}{}", message(node, context, &receiver, &argument, &report.lhs, &report.rhs), report.extra);
    let _ = enclosing_class;
    context.report_fixed("EqualsIncompatibleType", node, open_paren(node), &text, &[]);
}
