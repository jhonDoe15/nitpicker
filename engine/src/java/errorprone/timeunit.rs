//! TimeUnitMismatch.
use super::fixes::Fix;
use super::nodes::{enclosing, position};
use super::Context;
use crate::engine::source::{children, named_children, parent};
use crate::java::types::expr::{Binding, Receiver};
use crate::java::types::model::Type;
use tree_sitter::Node;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Unit {
    Nanoseconds,
    Microseconds,
    Milliseconds,
    Seconds,
    Minutes,
    Hours,
    Days,
}

const ALL: [Unit; 7] = [Unit::Nanoseconds, Unit::Microseconds, Unit::Milliseconds, Unit::Seconds, Unit::Minutes, Unit::Hours, Unit::Days];

impl Unit {
    fn nanos(self) -> i64 {
        match self {
            Unit::Nanoseconds => 1,
            Unit::Microseconds => 1_000,
            Unit::Milliseconds => 1_000_000,
            Unit::Seconds => 1_000_000_000,
            Unit::Minutes => 60_000_000_000,
            Unit::Hours => 3_600_000_000_000,
            Unit::Days => 86_400_000_000_000,
        }
    }
    /// `this.convert(1, from)`.
    fn convert(self, from: Unit) -> i64 {
        from.nanos() / self.nanos()
    }
    fn upper(self) -> &'static str {
        match self {
            Unit::Nanoseconds => "NANOSECONDS",
            Unit::Microseconds => "MICROSECONDS",
            Unit::Milliseconds => "MILLISECONDS",
            Unit::Seconds => "SECONDS",
            Unit::Minutes => "MINUTES",
            Unit::Hours => "HOURS",
            Unit::Days => "DAYS",
        }
    }
    fn to_method(self) -> &'static str {
        match self {
            Unit::Nanoseconds => "toNanos",
            Unit::Microseconds => "toMicros",
            Unit::Milliseconds => "toMillis",
            Unit::Seconds => "toSeconds",
            Unit::Minutes => "toMinutes",
            Unit::Hours => "toHours",
            Unit::Days => "toDays",
        }
    }
}

struct Found<'t> {
    innermost: Node<'t>,
    outermost: Unit,
    innermost_unit: Unit,
}

fn suffix(word: &str) -> Option<Unit> {
    Some(match word {
        "sec" | "secs" | "second" | "seconds" => Unit::Seconds,
        "milli" | "millis" | "mills" | "ms" | "msec" | "msecs" | "millisec" | "millisecs" | "millisecond" | "milliseconds" => Unit::Milliseconds,
        "micro" | "micros" | "us" | "usec" | "usecs" | "microsec" | "microsecs" | "microsecond" | "microseconds" => Unit::Microseconds,
        "nano" | "nanos" | "ns" | "nsec" | "nsecs" | "nanosec" | "nanosecs" | "nanosecond" | "nanoseconds" => Unit::Nanoseconds,
        _ => return None,
    })
}

const NUMBER_WORDS: &[&str] = &[
    "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "twenty", "thirty", "forty", "fifty", "sixty",
];

/// Error Prone's `NamingConventions.splitToLowercaseTerms`.
fn split_terms(name: &str) -> Vec<String> {
    if !name.is_empty() && name.chars().all(|part| part == '_') {
        return vec![name.to_string()];
    }
    let chars: Vec<char> = name.chars().collect();
    let digits_to_end = |from: usize| from < chars.len() && chars[from..].iter().all(|part| part.is_ascii_digit());
    let mut terms = Vec::new();
    let mut current = String::new();
    for (at, &part) in chars.iter().enumerate() {
        let before = at.checked_sub(1).map(|previous| chars[previous]);
        let boundary = before.is_some_and(|previous| (previous.is_ascii_lowercase() || previous.is_ascii_digit()) && part.is_ascii_uppercase())
            || (digits_to_end(at) && !before.is_some_and(|previous| previous.is_ascii_digit() || previous == '_'));
        if part == '_' || boundary {
            if !current.is_empty() {
                terms.push(std::mem::take(&mut current).to_lowercase());
            }
        }
        if part != '_' {
            current.push(part);
        }
    }
    if !current.is_empty() {
        terms.push(current.to_lowercase());
    }
    terms
}

fn fix_unit_camel_case(words: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    let mut at = 0;
    while at + 1 < words.len() {
        let together = format!("{}{}", words[at], words[at + 1]);
        if suffix(&together).is_some() {
            out.push(together);
            at += 1;
        } else {
            out.push(words[at].clone());
        }
        at += 1;
    }
    if at + 1 == words.len() {
        out.push(words[at].clone());
    }
    out
}

fn unit_by_name(name: &str) -> Option<Unit> {
    match name {
        "second" | "getSecond" => return None,
        "secondsPart" => return Some(Unit::Nanoseconds),
        "msToS" => return Some(Unit::Seconds),
        _ => {}
    }
    let words = fix_unit_camel_case(&split_terms(name));
    let first = words.first()?;
    if first == "second" {
        return None;
    }
    if words.len() == 2 && suffix(&words[1]).is_some() && (first == "from" || NUMBER_WORDS.contains(&first.as_str())) {
        return None;
    }
    let mut units: Vec<Unit> = words.iter().filter_map(|word| suffix(word)).collect();
    units.dedup();
    units.sort_by_key(|unit| unit.nanos());
    units.dedup();
    (units.len() == 1).then(|| units[0])
}

pub(super) fn integer_value(context: &Context, node: Node) -> Option<i64> {
    match node.kind() {
        "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" => {
            let text: String = context.text(node).chars().filter(|part| *part != '_').collect();
            let text = text.trim_end_matches(['l', 'L']);
            let lowered = text.to_lowercase();
            if let Some(hex) = lowered.strip_prefix("0x") {
                i64::from_str_radix(hex, 16).ok()
            } else if let Some(binary) = lowered.strip_prefix("0b") {
                i64::from_str_radix(binary, 2).ok()
            } else if lowered.len() > 1 && lowered.starts_with('0') {
                i64::from_str_radix(&lowered[1..], 8).ok()
            } else {
                lowered.parse().ok()
            }
        }
        "parenthesized_expression" => integer_value(context, node.named_child(0)?),
        "unary_expression" => {
            let operand = integer_value(context, node.child_by_field_name("operand")?)?;
            match context.text(node.child_by_field_name("operator")?) {
                "-" => operand.checked_neg(),
                "+" => Some(operand),
                _ => None,
            }
        }
        "binary_expression" => {
            let left = integer_value(context, node.child_by_field_name("left")?)?;
            let right = integer_value(context, node.child_by_field_name("right")?)?;
            match context.text(node.child_by_field_name("operator")?) {
                "*" => left.checked_mul(right),
                "+" => left.checked_add(right),
                "-" => left.checked_sub(right),
                "/" => left.checked_div(right),
                _ => None,
            }
        }
        "identifier" => match context.resolver.binding(node, context.text(node))? {
            Binding::Field(_, _, field) => field.number.map(i64::from).or_else(|| field.constant.as_deref()?.parse().ok()),
            Binding::Local(_) => None,
        },
        "field_access" => {
            let name = context.text(node.child_by_field_name("field")?);
            match context.resolver.receiver(node.child_by_field_name("object")?)? {
                Receiver::Static(owner) | Receiver::Value(Type::Class(owner, _)) => {
                    let field = context.resolver.index.field(&owner, name)?.1;
                    field.number.map(i64::from).or_else(|| field.constant.as_deref()?.parse().ok())
                }
                _ => None,
            }
        }
        _ => None,
    }
}

fn factor(context: &Context, node: Node) -> Option<i64> {
    integer_value(context, node).filter(|value| *value != 0)
}

fn class_simple_name(context: &Context, node: Node) -> Option<String> {
    let class = enclosing(node, &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"])?;
    Some(context.text(class.child_by_field_name("name")?).to_string())
}

/// Error Prone's `extractArgumentName`.
fn argument_name(context: &Context, node: Node) -> Option<String> {
    match node.kind() {
        "cast_expression" => argument_name(context, node.child_by_field_name("value")?),
        "method_reference" => Some(context.text(*children(node).last()?).to_string()),
        "field_access" => {
            let member = context.text(node.child_by_field_name("field")?);
            if member == "get" { argument_name(context, node.child_by_field_name("object")?) } else { Some(member.to_string()) }
        }
        "method_invocation" => {
            let name = context.text(node.child_by_field_name("name")?);
            if name != "get" {
                return Some(name.to_string());
            }
            match node.child_by_field_name("object") {
                Some(object) => argument_name(context, object),
                None => Some("get".to_string()),
            }
        }
        "identifier" => Some(context.text(node).to_string()),
        "this" => class_simple_name(context, node),
        _ => None,
    }
}

fn numeric_time(context: &Context, node: Node) -> bool {
    match context.resolver.type_of(node) {
        Some(Type::Primitive(name)) => matches!(name, "int" | "long" | "double"),
        Some(Type::Class(name, _)) => matches!(name.as_str(), "java.lang.Integer" | "java.lang.Long" | "java.lang.Double"),
        _ => false,
    }
}

fn with_conversion<'t>(context: &Context, factor: i64, tree: Node<'t>, reciprocal: bool) -> Option<Found<'t>> {
    let underlying = unit_by_tree(context, tree)?;
    let unit = ALL.iter().copied().find(|unit| if reciprocal { underlying.outermost.convert(*unit) == factor } else { unit.convert(underlying.outermost) == factor })?;
    Some(Found { innermost: underlying.innermost, outermost: unit, innermost_unit: underlying.innermost_unit })
}

fn unit_by_tree<'t>(context: &Context, tree: Node<'t>) -> Option<Found<'t>> {
    if tree.kind() == "binary_expression" {
        let (left, right) = (tree.child_by_field_name("left")?, tree.child_by_field_name("right")?);
        match context.text(tree.child_by_field_name("operator")?) {
            "*" => {
                if let Some(value) = factor(context, left) {
                    return with_conversion(context, value, right, false);
                }
                if let Some(value) = factor(context, right) {
                    return with_conversion(context, value, left, false);
                }
            }
            "/" => {
                if let Some(value) = factor(context, right) {
                    return with_conversion(context, value, left, true);
                }
            }
            _ => {}
        }
    }
    let unit = unit_by_name(&argument_name(context, tree)?)?;
    Some(Found { innermost: tree, outermost: unit, innermost_unit: unit })
}

fn convert_tree(context: &Context, actual: Node, inner: Node, to: Unit, from: Unit) -> Fix {
    if to == from {
        return Fix::replace(actual.start_byte(), actual.end_byte(), context.text(inner));
    }
    Fix::replace(actual.start_byte(), actual.end_byte(), &format!("{}.{}({})", from.upper(), to.to_method(), context.text(inner))).with_imports()
}

fn descriptor_name(context: &Context, node: Node) -> Option<String> {
    let Some(Type::Class(interface, _)) = context.resolver.expected(node) else { return None };
    context.resolver.index.functional_method(&interface).map(|(_, method)| method.name.clone())
}

fn check(context: &Context, formal: &str, actual: Node) -> bool {
    let Some(target) = unit_by_name(formal) else { return false };
    let Some(provided) = unit_by_tree(context, actual) else { return false };
    if target == provided.outermost {
        return false;
    }
    if actual.kind() == "method_reference" {
        let numeric = match context.resolver.expected(actual) {
            Some(Type::Class(interface, _)) => context.resolver.index.functional_method(&interface).map(|(_, method)| matches!(&method.returns, Type::Primitive(name) if !matches!(*name, "void" | "boolean"))),
            _ => None,
        };
        if numeric != Some(true) {
            return false;
        }
    } else if !numeric_time(context, actual) {
        return false;
    }
    let given = provided.outermost;
    let mut message = format!(
        "Possible unit mismatch: expected {} but was {}. Before accepting this change, make sure that there is a true unit mismatch and not just an identifier whose name contains the wrong unit. (If there is, correct that instead!)",
        target.upper().to_lowercase(),
        given.upper().to_lowercase()
    );
    let small = |unit: Unit| matches!(unit, Unit::Microseconds | Unit::Milliseconds);
    if small(given) && small(target) {
        message.push_str(" WARNING: This checker considers \"ms\" and \"msec\" to always refer to *milli*seconds. Occasionally, code uses them for *micro*seconds. If this error involves identifiers with those terms, be sure to check that it does mean milliseconds before accepting this fix. If it instead means microseconds, consider renaming to \"us\" or \"usec\" (or just \"micros\").");
    } else if target == Unit::Seconds && !matches!(given, Unit::Hours | Unit::Days) {
        message.push_str(" WARNING: The suggested replacement truncates fractional seconds, so a value like 999ms becomes 0.Consider performing a floating-point division instead.");
    }
    let fix = convert_tree(context, actual, provided.innermost, target, provided.innermost_unit);
    context.report_fixed("TimeUnitMismatch", actual, position(actual), &message, &[fix]);
    true
}

fn binary(context: &Context, node: Node) {
    let (Some(left), Some(right), Some(operator)) = (node.child_by_field_name("left"), node.child_by_field_name("right"), node.child_by_field_name("operator")) else { return };
    let operator = context.text(operator);
    if !matches!(operator, "+" | "-" | "<" | ">" | "<=" | ">=" | "==" | "!=") {
        return;
    }
    let (Some(lhs), Some(rhs)) = (unit_by_tree(context, left), unit_by_tree(context, right)) else { return };
    if lhs.outermost == rhs.outermost || !numeric_time(context, left) || !numeric_time(context, right) {
        return;
    }
    let mut message = format!(
        "This operation seems to mix up time units: {} and {}. The generated fix uses the smaller unit to preserve precision.",
        lhs.outermost.upper(),
        rhs.outermost.upper()
    );
    if matches!(context.resolver.type_of(node), Some(Type::Primitive("boolean"))) {
        message.push_str(" We picked the smaller unit (so larger result) to avoid truncation errors, but this may result in overflow.");
    } else {
        message.push_str(" We picked the smaller unit to preserve truncation, but this may not be the right unit for the result. Please review carefully!");
    }
    let fix = if lhs.outermost.convert(rhs.outermost) != 0 {
        convert_tree(context, right, rhs.innermost, lhs.outermost, rhs.innermost_unit)
    } else {
        convert_tree(context, left, lhs.innermost, rhs.outermost, lhs.innermost_unit)
    };
    context.report_fixed("TimeUnitMismatch", node, position(node), &message, &[fix]);
}

fn ternary(context: &Context, node: Node) {
    let (Some(first), Some(second)) = (node.child_by_field_name("consequence"), node.child_by_field_name("alternative")) else { return };
    let (Some(lhs), Some(rhs)) = (unit_by_tree(context, first), unit_by_tree(context, second)) else { return };
    if lhs.outermost != rhs.outermost && numeric_time(context, first) && numeric_time(context, second) {
        let message = format!("The branches of this ternary expression have different time units: {} and {}.", lhs.outermost.upper(), rhs.outermost.upper());
        context.report_fixed("TimeUnitMismatch", node, position(node), &message, &[]);
    }
}

fn arguments(call: Node) -> Vec<Node> {
    call.child_by_field_name("arguments").map(named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

fn check_all(context: &Context, names: &[String], actuals: &[Node]) {
    if names.len() == actuals.len() {
        for (name, actual) in names.iter().zip(actuals) {
            check(context, name, *actual);
        }
    }
}

fn time_unit_to_unit(context: &Context, call: Node, name: &str, actuals: &[Node]) -> bool {
    let Some(object) = call.child_by_field_name("object") else { return false };
    let receiver = match object.kind() {
        "field_access" => object.child_by_field_name("field").map(|field| context.text(field)),
        "identifier" => matches!(context.resolver.binding(object, context.text(object)), Some(Binding::Field(..))).then(|| context.text(object)),
        _ => None,
    };
    let Some(receiver) = receiver else { return false };
    let constant = ALL.iter().any(|unit| unit.upper() == receiver);
    let is_unit = matches!(context.resolver.type_of(object), Some(Type::Class(class, _)) if class == "java.util.concurrent.TimeUnit");
    if constant && is_unit && ALL.iter().any(|unit| unit.to_method() == name) && actuals.len() == 1 {
        return check(context, receiver, actuals[0]);
    }
    false
}

fn invocation(context: &Context, node: Node) {
    if !arguments(node).iter().any(|argument| unit_by_tree(context, *argument).is_some()) {
        return;
    }
    let Some(call) = context.resolver.resolve_call(node) else { return };
    let actuals = arguments(node);
    let name = call.method.name.clone();
    time_unit_to_unit(context, node, &name, &actuals);
    if call.method.parameters.len() == 1 && matches!(call.method.returns, Type::Primitive("void")) && actuals.len() == 1 && check(context, &name, actuals[0]) {
        return;
    }
    check_all(context, &call.method.names, &actuals);
}

fn returned(context: &Context, node: Node) {
    let Some(value) = node.named_child(0) else { return };
    let mut current = parent(node);
    while let Some(above) = current {
        match above.kind() {
            "lambda_expression" => {
                if let Some(name) = descriptor_name(context, above) {
                    check(context, &name, value);
                }
                return;
            }
            "method_declaration" | "constructor_declaration" => {
                if let Some(name) = above.child_by_field_name("name") {
                    check(context, context.text(name), value);
                }
                return;
            }
            _ => current = parent(above),
        }
    }
}

pub fn time_unit_mismatch(context: &Context, node: Node) {
    match node.kind() {
        "assignment_expression" => {
            if node.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=") {
                if let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) {
                    if let Some(name) = argument_name(context, left) {
                        check(context, &name, right);
                    }
                }
            }
        }
        "binary_expression" => binary(context, node),
        "ternary_expression" => ternary(context, node),
        "return_statement" => returned(context, node),
        "variable_declarator" => {
            if let (Some(name), Some(value)) = (node.child_by_field_name("name"), node.child_by_field_name("value")) {
                check(context, context.text(name), value);
            }
        }
        "object_creation_expression" => {
            if !arguments(node).iter().any(|argument| unit_by_tree(context, *argument).is_some()) {
                return;
            }
            if let Some(call) = context.resolver.resolve_constructor(node) {
                check_all(context, &call.method.names, &arguments(node));
            }
        }
        "method_invocation" => invocation(context, node),
        "method_reference" => {
            if let Some(name) = descriptor_name(context, node) {
                check(context, &name, node);
            }
        }
        _ => {}
    }
}
