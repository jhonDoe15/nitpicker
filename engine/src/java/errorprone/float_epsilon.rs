//! FloatingPointAssertionWithinEpsilon: a tolerance below the gap to the next float or double.
use super::Context;
use super::call_match::static_on_class;
use super::consts::{Const, constant};
use super::fixes::Fix;
use super::flogger_calls::on_descendant;
use super::formatter::float::general_two_digits;
use super::positions::{arguments, preferred, receiver};
use crate::java::types::model::Type;
use tree_sitter::Node;

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Float,
    Double,
}

impl Kind {
    fn name(self) -> &'static str {
        if self == Kind::Float { "float" } else { "double" }
    }
    fn subject(self) -> &'static str {
        if self == Kind::Float { "com.google.common.truth.FloatSubject" } else { "com.google.common.truth.DoubleSubject" }
    }
    fn tolerant(self) -> String {
        format!("{}.{}", self.subject(), if self == Kind::Float { "TolerantFloatComparison" } else { "TolerantDoubleComparison" })
    }
    /// The gap to the nearer neighbour, as a power of two; `None` when it is not a number.
    fn gap(self, actual: f64) -> Option<f64> {
        let gap = if self == Kind::Float {
            let number = actual as f32;
            let (up, down) = (number.next_up() - number, number - number.next_down());
            f64::from(if up.is_nan() || down.is_nan() { f32::NAN } else { up.min(down) })
        } else {
            let (up, down) = (actual.next_up() - actual, actual - actual.next_down());
            if up.is_nan() || down.is_nan() { f64::NAN } else { up.min(down) }
        };
        (!gap.is_nan()).then_some(gap)
    }
    fn intolerant(self, tolerance: f64, actual: f64) -> Option<f64> {
        let gap = self.gap(actual)?;
        let tolerance = if self == Kind::Float { f64::from(tolerance as f32) } else { tolerance };
        (tolerance != 0.0 && tolerance < gap).then_some(gap)
    }
}

fn number(context: &Context, node: Node) -> Option<f64> {
    match constant(context, node)? {
        Const::Int(value) => Some(f64::from(value)),
        Const::Long(value) => Some(value as f64),
        Const::Float(value) => Some(f64::from(value)),
        Const::Double(value) => Some(value),
        _ => None,
    }
}

fn number_as(context: &Context, node: Node, kind: Kind) -> Option<f64> {
    let value = match constant(context, node)? {
        Const::Long(value) if kind == Kind::Float => return Some(f64::from(value as f32)),
        _ => number(context, node)?,
    };
    Some(if kind == Kind::Float { f64::from(value as f32) } else { value })
}

fn parameters(context: &Context, call: Node, wanted: &[&str]) -> bool {
    context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.parameters.iter().map(Type::name).eq(wanted.iter().map(|name| name.to_string())))
}

fn exponent(gap: f64) -> i32 {
    let bits = gap.to_bits();
    let biased = ((bits >> 52) & 0x7ff) as i32;
    if biased == 0 { bits.trailing_zeros() as i32 - 1074 } else { biased - 1023 }
}

fn message(gap: f64) -> String {
    format!(
        "This fuzzy equality check is using a tolerance less than the gap to the next number (which is ~{}). You may want a less restrictive tolerance, or to assert equality.",
        general_two_digits(exponent(gap))
    )
}

fn literal(node: Node) -> bool {
    let numeric = |kind: &str| kind.ends_with("_literal") && kind != "string_literal" && kind != "null_literal" && kind != "character_literal";
    numeric(node.kind())
        || (node.kind() == "unary_expression"
            && node.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "-")
            && node.child_by_field_name("operand").is_some_and(|operand| matches!(operand.kind(), "decimal_integer_literal")))
}

fn remove_suffix(text: &str) -> &str {
    text.strip_suffix(['f', 'F', 'd', 'D', 'l', 'L']).unwrap_or(text)
}

fn cast_if_necessary(context: &Context, argument: Node, kind: Kind) -> String {
    let source = context.text(argument);
    let found = context.resolver.type_of(argument).map(Type::unboxed_or_same);
    if found == Some(Type::Primitive(kind.name())) {
        return source.to_string();
    }
    if literal(argument) {
        let bare = remove_suffix(source);
        if kind == Kind::Float {
            return format!("{bare}f");
        }
        let parsed: Option<f64> = bare.parse().ok();
        if parsed.is_some() && parsed == number(context, argument) {
            return if bare.contains('.') { bare.to_string() } else { format!("{bare}d") };
        }
    }
    if super::builders::requires_parentheses(argument) { format!("({}) ({source})", kind.name()) } else { format!("({}) {source}", kind.name()) }
}

fn report(context: &Context, call: Node, gap: f64, fix: Fix) {
    context.report_fixed("FloatingPointAssertionWithinEpsilon", call, preferred(context, call), &message(gap), &[fix]);
}

fn junit(context: &Context, call: Node, kind: Kind) -> bool {
    let list = arguments(call);
    let name = kind.name();
    let (tolerance, actual) = if static_on_class(context, call, "org.junit.Assert", &["assertEquals"]) && parameters(context, call, &[name, name, name]) {
        (list[2], list[0])
    } else if static_on_class(context, call, "org.junit.Assert", &["assertEquals"]) && parameters(context, call, &["java.lang.String", name, name, name]) {
        (list[3], list[1])
    } else {
        return false;
    };
    if let (Some(tolerance), Some(actual)) = (number_as(context, tolerance, kind), number_as(context, actual, kind)) {
        if let Some(gap) = kind.intolerant(tolerance, actual) {
            let last = list[list.len() - 1];
            report(context, call, gap, Fix::replace(last.start_byte(), last.end_byte(), "0"));
        }
    }
    true
}

fn truth(context: &Context, call: Node, kind: Kind) -> bool {
    let name = kind.name();
    if !(on_descendant(context, call, &kind.tolerant(), &["of"], false) && parameters(context, call, &[name])) {
        return false;
    }
    let Some(within) = receiver(call) else { return false };
    if !(on_descendant(context, within, kind.subject(), &["isWithin", "isNotWithin"], false) && parameters(context, within, &[name])) {
        return false;
    }
    let (Some(tolerance), Some(argument)) = (arguments(within).first().copied(), arguments(call).first().copied()) else { return false };
    let (Some(tolerance_value), Some(actual)) = (number_as(context, tolerance, kind), number_as(context, argument, kind)) else { return true };
    let Some(gap) = kind.intolerant(tolerance_value, actual) else { return true };
    let Some(assertion) = receiver(within) else { return true };
    let method = within.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    let replacement = if method.contains("Not") { "isNotEqualTo" } else { "isEqualTo" };
    let text = format!("{}.{replacement}({})", context.text(assertion), cast_if_necessary(context, argument, kind));
    report(context, call, gap, Fix::replace(call.start_byte(), call.end_byte(), text));
    true
}

pub fn floating_point_assertion_within_epsilon(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    for kind in [Kind::Float, Kind::Double] {
        if junit(context, call, kind) || truth(context, call, kind) {
            return;
        }
    }
}
