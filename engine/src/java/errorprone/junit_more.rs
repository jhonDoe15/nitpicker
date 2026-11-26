//! JUnit 3 and JUnit 4 mix-ups and incompatible assertions: JUnit3FloatingPointComparisonWithoutDelta, JUnit4ClassUsedInJUnit3,
//! JUnitAmbiguousTestClass and JUnitIncompatibleType.
use super::array_calls::variable_bound;
use super::call_match::static_on_class;
use super::compat::{compatibility, pretty, qualified};
use super::fixes::Fix;
use super::inject_checks::annotation_class;
use super::junit3::{is_ambiguous_junit_version, is_junit3_test_class};
use super::junit_init::{annotated_on_overridden, enclosing_class, TEST};
use super::nodes::class_position;
use super::parts::arguments;
use super::positions::preferred;
use super::target::is_numeric;
use super::Context;
use crate::java::types::scope::Resolver;
use crate::engine::source::{children, named_children};
use crate::java::types::model::{Type, OBJECT};
use tree_sitter::Node;

const STRING: &str = "java.lang.String";
const ASSERTS: [&str; 3] = ["org.junit.Assert", "junit.framework.Assert", "junit.framework.TestCase"];

fn is_string(kind: &Type) -> bool {
    matches!(kind, Type::Class(name, _) if name == STRING)
}

fn is_floating(kind: &Type) -> bool {
    matches!(kind.clone().unboxed_or_same(), Type::Primitive("double" | "float"))
}

fn can_be_converted_to_junit4(types: &[Type]) -> bool {
    if types.len() > 2 {
        return true;
    }
    let (first, second) = (&types[0], &types[1]);
    if !is_floating(first) && !is_floating(second) {
        return true;
    }
    if !is_numeric(&first.clone().unboxed_or_same()) || !is_numeric(&second.clone().unboxed_or_same()) {
        return true;
    }
    !matches!(first, Type::Primitive(_)) && !matches!(second, Type::Primitive(_))
}

pub fn junit3_floating_point_comparison_without_delta(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !static_on_class(context, call, "junit.framework.TestCase", &["assertEquals"]) {
        return;
    }
    let list = arguments(call);
    let Some(mut types) = list.iter().map(|argument| context.resolver.type_of(*argument)).collect::<Option<Vec<Type>>>() else { return };
    if types.len() < 2 {
        return;
    }
    if types.len() != 2 && is_string(&types[0]) {
        types.remove(0);
    }
    if can_be_converted_to_junit4(&types) {
        return;
    }
    let mut fixes = Vec::new();
    if context.resolver.index.has("com.google.common.truth.Truth") {
        let text = |at: usize| context.text(list[at]);
        let truth = match list.len() {
            2 => Some(format!("assertThat({}).isEqualTo({})", text(1), text(0))),
            3 => Some(format!("assertWithMessage({}).that({}).isEqualTo({})", text(0), text(2), text(1))),
            _ => None,
        };
        let Some(truth) = truth else { return };
        fixes.push(Fix::replace(call.start_byte(), call.end_byte(), truth).with_imports());
    }
    let double = types.iter().take(2).any(|kind| kind.clone().unboxed_or_same() == Type::Primitive("double"));
    let end = list.last().map_or(call.end_byte(), |last| last.end_byte());
    fixes.push(Fix::replace(end, end, if double { ", 0.0" } else { ", 0.0f" }));
    context.report_fixed("JUnit3FloatingPointComparisonWithoutDelta", call, preferred(context, call), "Floating-point comparison without error tolerance", &fixes);
}

fn in_junit3_class(context: &Context, node: Node) -> bool {
    enclosing_class(node).is_some_and(|class| is_junit3_test_class(context, class))
}

fn report_junit4(context: &Context, node: Node, at: usize, rejected: &str) {
    let message = format!("{rejected} cannot be used inside a JUnit3 class. Convert your class to JUnit4 style.");
    context.report_fixed("JUnit4ClassUsedInJUnit3", node, at, &message, &[]);
}

pub fn junit4_class_used_in_junit3(context: &Context, node: Node) {
    match node.kind() {
        "method_invocation" => {
            let Some(resolved) = context.resolver.resolve_call(node).filter(|resolved| resolved.method.is_static) else { return };
            let owner = if node.child_by_field_name("object").is_some() { resolved.receiver.erased().name() } else { resolved.declaring };
            if owner == "org.junit.Assume" && in_junit3_class(context, node) {
                report_junit4(context, node, preferred(context, node), "Assume");
            }
        }
        "annotation" | "marker_annotation" => {
            let rejected = match annotation_class(context, node).as_deref() {
                Some("org.junit.Ignore") => "@Ignore",
                Some("org.junit.Rule") => "@Rule",
                _ => return,
            };
            if in_junit3_class(context, node) {
                report_junit4(context, node, node.start_byte(), rejected);
            }
        }
        _ => {}
    }
}

const AMBIGUOUS: &str = "Test class inherits from JUnit 3's TestCase but has JUnit 4 @Test or @RunWith annotations.";

pub fn junit_ambiguous_test_class(context: &Context, class: Node) {
    if class.kind() == "class_declaration" && is_ambiguous_junit_version(context, class) {
        context.report_fixed("JUnitAmbiguousTestClass", class, class_position(class), AMBIGUOUS, &[]);
    }
    if class.kind() != "object_creation_expression" {
        return;
    }
    let Some(body) = children(class).into_iter().find(|part| part.kind() == "class_body") else { return };
    let derived = matches!(context.resolver.type_node(class.child_by_field_name("type").unwrap_or(class)), Some(Type::Class(name, _)) if context.resolver.index.is_subtype(&name, "junit.framework.TestCase"));
    if derived && named_children(body).into_iter().any(|member| member.kind() == "method_declaration" && annotated_on_overridden(context, member, &[TEST])) {
        context.report_fixed("JUnitAmbiguousTestClass", body, body.start_byte(), AMBIGUOUS, &[]);
    }
}

fn is_subtype(context: &Context, sub: &Type, sup: &Type) -> bool {
    match (sub, sup) {
        (Type::Primitive(a), Type::Primitive(b)) => a == b,
        (Type::Class(a, _), Type::Class(b, _)) => context.resolver.index.is_subtype(a, b),
        (Type::Array(_), Type::Class(name, _)) => matches!(name.as_str(), OBJECT | "java.lang.Cloneable" | "java.io.Serializable"),
        (Type::Array(a), Type::Array(b)) => match (&**a, &**b) {
            (Type::Primitive(x), Type::Primitive(y)) => x == y,
            (Type::Primitive(_), _) | (_, Type::Primitive(_)) => false,
            (x, y) => is_subtype(context, x, y),
        },
        _ => false,
    }
}

/// `IgnoringCasts.ignoringCasts`: the most specific type of a cast or of its operand.
fn ignoring_casts(context: &Context, resolver: &Resolver, tree: Node) -> Option<Type> {
    match tree.kind() {
        "parenthesized_expression" => ignoring_casts(context, resolver, tree.named_child(0)?),
        "cast_expression" => {
            let cast = resolver.type_of(tree)?;
            let operand = ignoring_casts(context, resolver, tree.child_by_field_name("value")?)?;
            Some(if matches!(cast, Type::Primitive(_)) || is_subtype(context, &cast, &operand) { cast } else { operand })
        }
        _ => resolver.type_of(tree),
    }
}

/// The type with each type variable replaced by its first bound: `getUpperBound` for the types the comparison looks at.
fn bounded(context: &Context, usage: Node, kind: &Type, depth: usize) -> Type {
    match kind {
        Type::Variable(name) if depth < 4 => match variable_bound(context, usage, name) {
            Some(bound) => bounded(context, usage, &bound, depth + 1),
            None => Type::class(OBJECT),
        },
        Type::Class(name, arguments) => Type::Class(name.clone(), arguments.iter().map(|argument| bounded(context, usage, argument, depth + 1)).collect()),
        Type::Array(element) => Type::Array(Box::new(bounded(context, usage, element, depth))),
        other => other.clone(),
    }
}

fn check_compatibility(context: &Context, call: Node, target: &Type, source: &Type) {
    let (bounded_target, bounded_source) = (bounded(context, call, target, 0), bounded(context, call, source, 0));
    let Some(report) = compatibility(context, &bounded_target, &bounded_source, &[], &[]) else { return };
    let (mut source_name, mut target_name) = (pretty(source), pretty(target));
    if source_name == target_name {
        source_name = qualified(source);
        target_name = qualified(target);
    }
    let message = format!("The types of this assertion are mismatched: type `{source_name}` is not compatible with `{target_name}`{}", report.extra);
    context.report_fixed("JUnitIncompatibleType", call, preferred(context, call), &message, &[]);
}

pub fn junit_incompatible_type(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return };
    let equals = matches!(name, "assertEquals" | "assertNotEquals");
    if !equals && name != "assertArrayEquals" {
        return;
    }
    if !ASSERTS.iter().any(|owner| static_on_class(context, call, owner, &[name])) {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    let parameters: Vec<String> = resolved.method.parameters.iter().map(Type::name).collect();
    let parameters: Vec<&str> = parameters.iter().map(String::as_str).collect();
    let list = arguments(call);
    let symbolic = context.resolver.symbolic();
    let skip = usize::from(parameters.first() == Some(&STRING));
    if equals {
        if !matches!(parameters.as_slice(), [OBJECT, OBJECT] | [STRING, OBJECT, OBJECT]) || list.len() < skip + 2 {
            return;
        }
        let (Some(first), Some(second)) = (ignoring_casts(context, &symbolic, list[skip]), ignoring_casts(context, &symbolic, list[skip + 1])) else { return };
        check_compatibility(context, call, &first, &second);
    } else {
        if list.len() < skip + 2 {
            return;
        }
        let (Some(first), Some(second)) = (ignoring_casts(context, &symbolic, list[skip]), ignoring_casts(context, &symbolic, list[skip + 1])) else { return };
        let upper = |kind: &Type| if matches!(kind, Type::Variable(_)) { bounded(context, call, kind, 0) } else { kind.clone() };
        let (Type::Array(expected), Type::Array(actual)) = (upper(&first), upper(&second)) else { return };
        check_compatibility(context, call, &expected, &actual);
    }
}
