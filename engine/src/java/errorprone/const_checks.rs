//! ComparisonOutOfRange, ConstantOverflow and XorPower: checks on the constant values of operands.
use super::Context;
use super::consts::{Const, constant};
use super::fixes::Fix;
use super::positions::preferred;
use crate::engine::source::parent;
use crate::java::types::model::Type;
use std::cmp::Ordering;
use tree_sitter::Node;

fn operator<'f>(context: &'f Context, binary: Node) -> &'f str {
    binary.child_by_field_name("operator").map(|operator| context.text(operator)).unwrap_or_default()
}

fn is_int_literal(node: Node, context: &Context) -> bool {
    matches!(node.kind(), "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal") && !context.text(node).ends_with(['l', 'L'])
}

#[derive(Clone, Copy)]
enum Number {
    Whole(i64),
    Single(f32),
    Double(f64),
}

fn java_double_order(a: f64, b: f64) -> Ordering {
    if a < b {
        return Ordering::Less;
    }
    if a > b {
        return Ordering::Greater;
    }
    let bits = |value: f64| if value.is_nan() { 0x7ff8_0000_0000_0000_i64 } else { value.to_bits() as i64 };
    bits(a).cmp(&bits(b))
}

fn java_float_order(a: f32, b: f32) -> Ordering {
    if a < b {
        return Ordering::Less;
    }
    if a > b {
        return Ordering::Greater;
    }
    let bits = |value: f32| if value.is_nan() { 0x7fc0_0000_i32 } else { value.to_bits() as i32 };
    bits(a).cmp(&bits(b))
}

impl Number {
    /// A whole-number bound as the kind of number the constant is.
    fn like(bound: i64, kind: &Number) -> Number {
        match kind {
            Number::Whole(_) => Number::Whole(bound),
            Number::Single(_) => Number::Single(bound as f32),
            Number::Double(_) => Number::Double(bound as f64),
        }
    }
    fn order(&self, other: &Number) -> Ordering {
        match (self, other) {
            (Number::Whole(a), Number::Whole(b)) => a.cmp(b),
            (Number::Single(a), Number::Single(b)) => java_float_order(*a, *b),
            (Number::Double(a), Number::Double(b)) => java_double_order(*a, *b),
            _ => Ordering::Equal,
        }
    }
    /// `Number.byteValue()`.
    fn byte_value(&self) -> i8 {
        match self {
            Number::Whole(value) => *value as i8,
            Number::Single(value) => (*value as i32) as i8,
            Number::Double(value) => (*value as i32) as i8,
        }
    }
}

const BOUNDS: [(&str, &str, i64, i64); 5] = [
    ("byte", "java.lang.Byte", -128, 127),
    ("char", "java.lang.Character", 0, 65535),
    ("short", "java.lang.Short", -32768, 32767),
    ("int", "java.lang.Integer", i32::MIN as i64, i32::MAX as i64),
    ("long", "java.lang.Long", i64::MIN, i64::MAX),
];

fn numeric_constant(context: &Context, node: Node) -> Option<Const> {
    constant(context, node).filter(|value| matches!(value, Const::Int(_) | Const::Long(_) | Const::Float(_) | Const::Double(_) | Const::Char(_)))
}

fn has_type(context: &Context, node: Node, primitive: &str, boxed: &str) -> bool {
    match context.resolver.type_of(node) {
        Some(Type::Primitive(name)) => name == primitive,
        Some(Type::Class(name, _)) => name == boxed,
        _ => false,
    }
}

fn describe(context: &Context, tree: Node, constant_node: Node, primitive: &str, bounds: (i64, i64), constant_number: &Number, will: bool) {
    let kind = operator(context, tree);
    let byte_equality = primitive == "byte" && matches!(kind, "==" | "!=");
    let fix = if byte_equality {
        Fix::replace(constant_node.start_byte(), constant_node.end_byte(), constant_number.byte_value().to_string())
    } else {
        Fix::replace(tree.start_byte(), tree.end_byte(), will.to_string())
    };
    let message = format!(
        "{primitive}s may have a value in the range {} to {}; therefore, this comparison to {} will always evaluate to {will}",
        bounds.0,
        bounds.1,
        context.text(constant_node)
    );
    context.report_fixed("ComparisonOutOfRange", tree, preferred(context, tree), &message, &[fix]);
}

pub fn comparison_out_of_range(context: &Context, tree: Node) {
    if tree.kind() != "binary_expression" {
        return;
    }
    let kind = operator(context, tree);
    if !matches!(kind, "==" | "!=" | "<" | "<=" | ">" | ">=") {
        return;
    }
    let (Some(left), Some(right)) = (tree.child_by_field_name("left"), tree.child_by_field_name("right")) else { return };
    let (left_value, right_value) = (numeric_constant(context, left), numeric_constant(context, right));
    if left_value.is_none() && right_value.is_none() {
        return;
    }
    for (primitive, boxed, low, high) in BOUNDS {
        let (constant_node, value) = if left_value.is_some() && has_type(context, right, primitive, boxed) {
            (left, left_value.clone())
        } else if right_value.is_some() && has_type(context, left, primitive, boxed) {
            (right, right_value.clone())
        } else {
            continue;
        };
        let Some(value) = value else { continue };
        let number = match value {
            Const::Char(code) => Number::Whole(i64::from(code)),
            Const::Int(whole) => Number::Whole(i64::from(whole)),
            Const::Long(whole) => Number::Whole(whole),
            Const::Float(single) => Number::Single(single),
            Const::Double(double) => Number::Double(double),
            _ => continue,
        };
        let (min, max) = (Number::like(low, &number), Number::like(high, &number));
        let constant_first = constant_node.id() == left.id();
        let outcome = |test: &dyn Fn(Ordering) -> bool| -> Option<bool> {
            let (at_min, at_max) = if constant_first {
                (test(number.order(&min)), test(number.order(&max)))
            } else {
                (test(min.order(&number)), test(max.order(&number)))
            };
            (at_min == at_max).then_some(at_min)
        };
        let out_of_bounds = number.order(&min) == Ordering::Less || number.order(&max) == Ordering::Greater;
        let result = match kind {
            "==" => out_of_bounds.then_some(false),
            "!=" => out_of_bounds.then_some(true),
            "<" => outcome(&|order| order == Ordering::Less),
            "<=" => outcome(&|order| order != Ordering::Greater),
            ">" => outcome(&|order| order == Ordering::Greater),
            _ => outcome(&|order| order != Ordering::Less),
        };
        if let Some(will) = result {
            describe(context, tree, constant_node, primitive, (low, high), &number, will);
        }
    }
}

#[derive(Clone, Copy)]
enum Boxed {
    Int(i32),
    Long(i64),
    Short(i16),
    Byte(i8),
}

impl Boxed {
    fn int_value(self) -> i32 {
        match self {
            Boxed::Int(value) => value,
            Boxed::Long(value) => value as i32,
            Boxed::Short(value) => i32::from(value),
            Boxed::Byte(value) => i32::from(value),
        }
    }
    fn long_value(self) -> i64 {
        match self {
            Boxed::Int(value) => i64::from(value),
            Boxed::Long(value) => value,
            Boxed::Short(value) => i64::from(value),
            Boxed::Byte(value) => i64::from(value),
        }
    }
    fn is_long(self) -> bool {
        matches!(self, Boxed::Long(_))
    }
}

type Outcome = Result<Option<Boxed>, ()>;

fn binop_long(operator: &str, lhs: i64, rhs: i64) -> Outcome {
    let checked = |found: Option<i64>| found.map(|value| Some(Boxed::Long(value))).ok_or(());
    Ok(Some(Boxed::Long(match operator {
        "*" => return checked(lhs.checked_mul(rhs)),
        "/" if rhs == 0 => return Err(()),
        "/" => lhs.wrapping_div(rhs),
        "%" if rhs == 0 => return Err(()),
        "%" => lhs.wrapping_rem(rhs),
        "+" => return checked(lhs.checked_add(rhs)),
        "-" => return checked(lhs.checked_sub(rhs)),
        "<<" => lhs.wrapping_shl((rhs & 63) as u32),
        ">>" => lhs.wrapping_shr((rhs & 63) as u32),
        ">>>" => ((lhs as u64).wrapping_shr((rhs & 63) as u32)) as i64,
        "&" => lhs & rhs,
        "^" => lhs ^ rhs,
        "|" => lhs | rhs,
        _ => return Ok(None),
    })))
}

fn binop_int(operator: &str, lhs: i32, rhs: i32) -> Outcome {
    let checked = |found: Option<i32>| found.map(|value| Some(Boxed::Int(value))).ok_or(());
    Ok(Some(Boxed::Int(match operator {
        "*" => return checked(lhs.checked_mul(rhs)),
        "/" if rhs == 0 => return Err(()),
        "/" => lhs.wrapping_div(rhs),
        "%" if rhs == 0 => return Err(()),
        "%" => lhs.wrapping_rem(rhs),
        "+" => return checked(lhs.checked_add(rhs)),
        "-" => return checked(lhs.checked_sub(rhs)),
        "<<" => lhs.wrapping_shl((rhs & 31) as u32),
        ">>" => lhs.wrapping_shr((rhs & 31) as u32),
        ">>>" => ((lhs as u32).wrapping_shr((rhs & 31) as u32)) as i32,
        "&" => lhs & rhs,
        "^" => lhs ^ rhs,
        "|" => lhs | rhs,
        _ => return Ok(None),
    })))
}

fn integral_constant(context: &Context, node: Node) -> Outcome {
    Ok(match constant(context, node) {
        Some(Const::Int(value)) => Some(Boxed::Int(value)),
        Some(Const::Long(value)) => Some(Boxed::Long(value)),
        _ => None,
    })
}

fn unary(operator: &str, value: Boxed) -> Option<Boxed> {
    if value.is_long() {
        let number = value.long_value();
        return Some(Boxed::Long(match operator {
            "+" => number,
            "-" => number.wrapping_neg(),
            "~" => !number,
            _ => return None,
        }));
    }
    let number = value.int_value();
    Some(Boxed::Int(match operator {
        "+" => number,
        "-" => number.wrapping_neg(),
        "~" => !number,
        _ => return None,
    }))
}

fn cast(kind: &str, value: Boxed) -> Option<Boxed> {
    Some(match kind {
        "short" => Boxed::Short(value.long_value() as i16),
        "int" => Boxed::Int(value.int_value()),
        "long" => Boxed::Long(value.long_value()),
        "byte" => Boxed::Byte(value.long_value() as i8),
        "char" => Boxed::Int(i32::from(value.int_value() as u16)),
        _ => return None,
    })
}

fn visit(context: &Context, node: Node) -> Outcome {
    match node.kind() {
        "parenthesized_expression" => match node.named_child(0) {
            Some(inner) => visit(context, inner),
            None => Ok(None),
        },
        "ternary_expression" => {
            let (Some(test), Some(yes), Some(no)) = (node.child_by_field_name("condition"), node.child_by_field_name("consequence"), node.child_by_field_name("alternative")) else { return Ok(None) };
            let (if_true, if_false) = (visit(context, yes)?, visit(context, no)?);
            Ok(match constant(context, test) {
                Some(Const::Bool(flag)) => if flag { if_true } else { if_false },
                _ => None,
            })
        }
        "unary_expression" => {
            let (Some(operator), Some(operand)) = (node.child_by_field_name("operator"), node.child_by_field_name("operand")) else { return Ok(None) };
            if context.text(operator) == "-" && operand.kind() == "decimal_integer_literal" {
                return integral_constant(context, node);
            }
            Ok(visit(context, operand)?.and_then(|value| unary(context.text(operator), value)))
        }
        "binary_expression" => {
            let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return Ok(None) };
            let (lhs, rhs) = (visit(context, left)?, visit(context, right)?);
            let (Some(lhs), Some(rhs)) = (lhs, rhs) else { return Ok(None) };
            let kind = operator(context, node);
            match (kind, lhs) {
                ("-", Boxed::Long(i64::MIN)) | ("-", Boxed::Int(i32::MIN)) | ("+", Boxed::Long(i64::MAX)) | ("+", Boxed::Int(i32::MAX)) => return Ok(None),
                _ => {}
            }
            if lhs.is_long() || rhs.is_long() {
                binop_long(kind, lhs.long_value(), rhs.long_value())
            } else {
                binop_int(kind, lhs.int_value(), rhs.int_value())
            }
        }
        "cast_expression" => {
            let (Some(kind), Some(value)) = (node.child_by_field_name("type"), node.child_by_field_name("value")) else { return Ok(None) };
            let Some(inner) = visit(context, value)? else { return Ok(None) };
            Ok(cast(context.text(kind), inner))
        }
        "field_access" | "identifier" | "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" => integral_constant(context, node),
        _ => Ok(None),
    }
}

const EXPRESSIONS: [&str; 22] = [
    "parenthesized_expression", "method_invocation", "object_creation_expression", "array_creation_expression", "array_initializer", "cast_expression",
    "ternary_expression", "unary_expression", "update_expression", "assignment_expression", "lambda_expression", "method_reference", "instanceof_expression",
    "field_access", "array_access", "switch_expression", "argument_list", "dimensions_expr", "annotation", "annotation_argument_list", "element_value_pair",
    "element_value_array_initializer",
];

/// Whether an expression tree sits, through expressions only, inside a binary one.
fn inside_binary(node: Node) -> bool {
    let mut current = parent(node);
    while let Some(up) = current {
        if up.kind() == "binary_expression" {
            return true;
        }
        if !EXPRESSIONS.contains(&up.kind()) {
            return false;
        }
        current = parent(up);
    }
    false
}

fn long_fix(context: &Context, tree: Node) -> Option<Fix> {
    let mut expression = tree;
    let mut innermost = tree;
    while expression.kind() == "binary_expression" {
        innermost = expression;
        expression = expression.child_by_field_name("left")?;
    }
    if !is_int_literal(expression, context) || context.resolver.type_of(innermost) != Some(Type::Primitive("int")) {
        return None;
    }
    let mut fix = Fix::new().insert(expression.end_byte(), "L");
    let declarator = parent(tree).filter(|up| up.kind() == "variable_declarator" && up.child_by_field_name("value").is_some_and(|value| value.id() == tree.id()));
    if let Some(declaration) = declarator.and_then(parent) {
        let kind = declaration.child_by_field_name("type").filter(|written| context.text(*written) == "int");
        if let Some(written) = kind {
            fix = fix.and(written.start_byte(), written.end_byte(), "long");
        }
    }
    Some(fix)
}

pub fn constant_overflow(context: &Context, tree: Node) {
    if tree.kind() != "binary_expression" || inside_binary(tree) || visit(context, tree).is_ok() {
        return;
    }
    let fixes: Vec<Fix> = long_fix(context, tree).into_iter().collect();
    context.report_fixed("ConstantOverflow", tree, preferred(context, tree), "Compile-time constant expression overflows", &fixes);
}

fn whole_value(value: Option<Const>) -> Option<(i64, bool)> {
    match value? {
        Const::Int(number) => Some((i64::from(number), false)),
        Const::Long(number) => Some((number, true)),
        _ => None,
    }
}

pub fn xor_power(context: &Context, tree: Node) {
    if tree.kind() != "binary_expression" || operator(context, tree) != "^" {
        return;
    }
    let Some(mut base) = tree.child_by_field_name("left") else { return };
    while base.kind() == "binary_expression" {
        let Some(next) = base.child_by_field_name("right") else { return };
        base = next;
    }
    let Some((lhs, is_long)) = whole_value(constant(context, base)) else { return };
    if lhs != i64::from(lhs as i32) || !matches!(lhs, 2 | 10) {
        return;
    }
    let Some(right) = tree.child_by_field_name("right") else { return };
    let Some((rhs, _)) = whole_value(constant(context, right)) else { return };
    if rhs != i64::from(rhs as i32) || context.text(right).starts_with('0') {
        return;
    }
    let message = format!(
        "The ^ operator is binary XOR, not a power operator, so '{}' will always evaluate to {}.",
        context.text(tree),
        (lhs as i32) ^ (rhs as i32)
    );
    let suffix = if is_long { "L" } else { "" };
    let (start, end) = (base.start_byte(), tree.end_byte());
    let mut fixes = Vec::new();
    if lhs == 2 {
        if (rhs as i32) <= if is_long { 63 } else { 31 } {
            let mut replacement = format!("1{suffix} << {rhs}");
            if start != tree.start_byte() {
                replacement = format!("({replacement})");
            }
            fixes.push(Fix::replace(start, end, replacement));
        }
    } else if (rhs as i32) <= if is_long { 18 } else { 9 } && rhs >= 0 {
        fixes.push(Fix::replace(start, end, format!("1{}{suffix}", "0".repeat(rhs as usize))));
    }
    context.report_fixed("XorPower", tree, preferred(context, tree), &message, &fixes);
}
