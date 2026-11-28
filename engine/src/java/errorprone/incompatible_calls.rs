//! PeriodTimeMath, ArrayFillIncompatibleType, IsInstanceOfClass, FuturesGetCheckedIllegalExceptionType and MixedDescriptors:
//! calls whose arguments cannot work for the method they are passed to.
use super::Context;
use super::call_match::{instance_on_exact_class, static_on_class};
use super::compat::{pretty, qualified};
use super::fixes::Fix;
use super::positions::{arguments, preferred};
use crate::java::types::model::{OBJECT, Type, flag};
use tree_sitter::Node;

pub fn period_time_math(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !instance_on_exact_class(context, call, "java.time.Period", &["plus", "minus"]) {
        return;
    }
    let Some(first) = arguments(call).first().copied() else { return };
    if matches!(context.resolver.type_of(first), Some(Type::Class(name, _)) if name == "java.time.Duration") {
        let message = "When adding or subtracting from a Period, Duration is incompatible.";
        context.report_fixed("PeriodTimeMath", call, preferred(context, call), message, &[]);
    }
}

/// The class a type variable stands for when it is erased: its first bound, or `Object`.
pub(super) fn erased_at(context: &Context, at: Node, kind: &Type) -> Type {
    match kind {
        Type::Variable(name) => super::array_calls::variable_bound(context, at, name).map_or(Type::class(OBJECT), |bound| erased_at(context, at, &bound)),
        Type::Array(element) => Type::Array(Box::new(erased_at(context, at, element))),
        other => other.erased(),
    }
}

/// `erasure(s) <: erasure(t)` for class and array types.
fn erased_subtype(context: &Context, at: Node, from: &Type, to: &Type) -> bool {
    let (from, to) = (erased_at(context, at, from), erased_at(context, at, to));
    match (&from, &to) {
        (Type::Null, Type::Primitive(_)) => false,
        (Type::Null, _) => true,
        (Type::Primitive(a), Type::Primitive(b)) => a == b,
        (Type::Class(a, _), Type::Class(b, _)) => a == b || context.resolver.index.is_subtype(a, b),
        (Type::Array(a), Type::Array(b)) => match (&**a, &**b) {
            (Type::Primitive(x), Type::Primitive(y)) => x == y,
            (Type::Primitive(_), _) | (_, Type::Primitive(_)) => false,
            _ => erased_subtype(context, at, a, b),
        },
        (Type::Array(_), Type::Class(name, _)) => matches!(name.as_str(), OBJECT | "java.lang.Cloneable" | "java.io.Serializable"),
        _ => false,
    }
}

fn valid_fill(context: &Context, at: Node, component: &Option<Type>, filling: &Option<Type>) -> bool {
    match (component, filling) {
        (Some(component), Some(filling)) => erased_subtype(context, at, &filling.clone().boxed(), component),
        _ => true,
    }
}

fn fill_message(filling: &Type, component: &Type) -> String {
    let (mut shown, mut wanted) = (pretty(filling), pretty(component));
    if shown == wanted {
        shown = qualified(filling);
        wanted = qualified(component);
    }
    format!("Calling Arrays.fill trying to put a {shown} into an array of type {wanted}")
}

pub fn array_fill_incompatible_type(context: &Context, call: Node) {
    if !static_on_class(context, call, "java.util.Arrays", &["fill"]) {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    let object_array = Type::Array(Box::new(Type::class(OBJECT)));
    let int = Type::Primitive("int");
    let object = Type::class(OBJECT);
    let parameters = &resolved.method.parameters;
    let shape_two = parameters.as_slice() == [object_array.clone(), object.clone()];
    let shape_four = parameters.as_slice() == [object_array, int.clone(), int, object];
    if !shape_two && !shape_four {
        return;
    }
    let list = arguments(call);
    let (Some(first), Some(last)) = (list.first().copied(), list.last().copied()) else { return };
    let component = match context.resolver.type_of(first) {
        Some(Type::Array(element)) => Some(*element),
        _ => None,
    };
    let filling = context.resolver.type_of(last);
    if valid_fill(context, call, &component, &filling) {
        return;
    }
    let report = |filling: &Type| {
        let symbolic = context.resolver.symbolic();
        let shown = match symbolic.type_of(first) {
            Some(Type::Array(element)) => *element,
            _ => match &component {
                Some(component) => component.clone(),
                None => return,
            },
        };
        context.report_fixed("ArrayFillIncompatibleType", call, preferred(context, call), &fill_message(filling, &shown), &[]);
    };
    if last.kind() == "ternary_expression" {
        for field in ["consequence", "alternative"] {
            let branch = last.child_by_field_name(field).and_then(|part| context.resolver.type_of(part));
            if !valid_fill(context, call, &component, &branch) {
                if let Some(branch) = branch {
                    return report(&branch);
                }
            }
        }
        return;
    }
    if let Some(filling) = filling {
        report(&filling);
    }
}

#[derive(PartialEq)]
enum Operand {
    Literal,
    GetClass,
    Expression,
}

/// `(kind, value, source)` of an operand of `isInstance`.
fn classify<'t>(context: &Context<'t>, node: Node<'t>) -> (Operand, String, String) {
    let source = context.text(node).to_string();
    if node.kind() == "method_invocation" {
        let name = node.child_by_field_name("name").map(|name| context.text(name));
        let plain = arguments(node).is_empty() && name == Some("getClass");
        if plain {
            return match node.child_by_field_name("object") {
                None => (Operand::Expression, source.clone(), source),
                Some(object) => (Operand::GetClass, context.text(object).to_string(), source),
            };
        }
    } else if node.kind() == "class_literal" {
        if let Some(kind) = node.named_child(0) {
            return (Operand::Literal, context.text(kind).to_string(), source);
        }
    }
    (Operand::Expression, source.clone(), source)
}

fn replacement(context: &Context, receiver: Node, argument: Node) -> String {
    let (left, left_value, left_source) = classify(context, receiver);
    let (right, right_value, right_source) = classify(context, argument);
    match (&left, &right) {
        (Operand::GetClass, Operand::Literal) | (Operand::Literal, Operand::GetClass) => {
            let (value, class) = if left == Operand::GetClass { (left_value, right_value) } else { (right_value, left_value) };
            format!("{value} instanceof {class}")
        }
        (Operand::GetClass, Operand::GetClass) => format!("{right_value}.getClass().isInstance({left_value})"),
        (Operand::Literal, Operand::Literal) => format!("{right_value}.class == Class.class"),
        (_, Operand::GetClass) => format!("{left_source}.isInstance({right_value})"),
        (Operand::GetClass, _) => format!("{right_source}.isInstance({left_value})"),
        _ => format!("{right_source}.isAssignableFrom({left_source})"),
    }
}

pub fn is_instance_of_class(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !instance_on_exact_class(context, call, "java.lang.Class", &["isInstance"]) {
        return;
    }
    let list = arguments(call);
    let (Some(argument), Some(receiver)) = (list.first().copied(), call.child_by_field_name("object")) else { return };
    let class_argument = matches!(context.resolver.type_of(argument), Some(Type::Class(name, _)) if name == "java.lang.Class");
    if !class_argument {
        return;
    }
    let fix = Fix::replace(call.start_byte(), call.end_byte(), replacement(context, receiver, argument));
    let message = "The argument to Class#isInstance(Object) should not be a Class";
    context.report_fixed("IsInstanceOfClass", call, preferred(context, call), message, &[fix]);
}

/// A constructor `getChecked` can call: public, with only `String` and `Throwable` parameters.
fn usable_constructor(context: &Context, class: &str) -> bool {
    let index = context.resolver.index;
    let Some(info) = index.get(class) else { return false };
    info.methods.iter().filter(|method| method.name == "<init>").any(|method| {
        method.detail.access & 1 != 0
            && method.parameters.iter().all(|kind| matches!(kind, Type::Class(name, _) if name == "java.lang.String" || name == "java.lang.Throwable"))
    })
}

fn inner_class(context: &Context, class: &str) -> bool {
    let index = context.resolver.index;
    let Some(info) = index.get(class) else { return false };
    let nested = class.strip_prefix(&info.package).map(|rest| rest.trim_start_matches('.')).is_some_and(|rest| rest.contains('.')) && !info.package.is_empty()
        || (info.package.is_empty() && class.contains('.'));
    if !nested || info.flags & (flag::STATIC | flag::ENUM | flag::RECORD | flag::ANNOTATION) != 0 || info.is_interface {
        return false;
    }
    let outer = class.rsplit_once('.').map(|(outer, _)| outer);
    !outer.and_then(|outer| index.get(outer)).is_some_and(|outer| outer.is_interface)
}

pub fn futures_get_checked_illegal_exception_type(context: &Context, call: Node) {
    if !static_on_class(context, call, "com.google.common.util.concurrent.Futures", &["getChecked"]) {
        return;
    }
    let list = arguments(call);
    let Some(second) = list.get(1).copied() else { return };
    let message = if let Some(Type::Class(name, given)) = context.resolver.type_of(second).filter(|kind| kind.name() != "null") {
        let class = context.resolver.index.is_subtype(&name, "java.lang.Class");
        let runtime = given.first().is_some_and(|first| matches!(first, Type::Class(argument, _) if context.resolver.index.is_subtype(argument, "java.lang.RuntimeException")));
        (class && runtime).then_some(true)
    } else {
        None
    };
    if message.is_some() {
        let first = context.text(list[0]);
        let fix = Fix::replace(call.start_byte(), call.end_byte(), format!("getUnchecked({first})")).with_imports();
        let text = "The exception class passed to getChecked must be a checked exception, not a RuntimeException.";
        context.report_fixed("FuturesGetCheckedIllegalExceptionType", call, preferred(context, call), text, &[fix]);
        return;
    }
    if second.kind() != "class_literal" {
        return;
    }
    let Some(written) = second.named_child(0) else { return };
    let Some(Type::Class(class, _)) = context.resolver.type_node(written) else { return };
    if inner_class(context, &class) || !usable_constructor(context, &class) {
        let text = "The exception class passed to getChecked must declare a public constructor whose only parameters are of type String or Throwable.";
        context.report_fixed("FuturesGetCheckedIllegalExceptionType", call, preferred(context, call), text, &[]);
    }
}
