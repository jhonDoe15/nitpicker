//! The values `javac` folds conditions to: literals, `boolean` and `int` constants of any class, and the operators
//! that keep an expression constant.
use super::Context;
use tree_sitter::Node;

#[derive(Clone, Copy, PartialEq)]
enum Fixed {
    Bool(bool),
    Int(i64),
}

fn field_value(field: &crate::java::types::model::Field) -> Option<Fixed> {
    let boolean = matches!(field.kind, crate::java::types::model::Type::Primitive("boolean"));
    match field.constant.as_deref().filter(|_| boolean) {
        Some("true") => Some(Fixed::Bool(true)),
        Some("false") => Some(Fixed::Bool(false)),
        _ => field.number.filter(|_| matches!(field.kind, crate::java::types::model::Type::Primitive("int"))).map(|value| Fixed::Int(i64::from(value as i32))),
    }
}

/// An `int` literal in any base; `long` literals are left alone.
fn integer(text: &str) -> Option<i64> {
    let digits = text.replace('_', "").to_ascii_lowercase();
    if digits.ends_with('l') {
        return None;
    }
    let parsed = if let Some(hex) = digits.strip_prefix("0x") {
        u32::from_str_radix(hex, 16).ok()
    } else if let Some(bits) = digits.strip_prefix("0b") {
        u32::from_str_radix(bits, 2).ok()
    } else if digits.len() > 1 && digits.starts_with('0') {
        u32::from_str_radix(&digits[1..], 8).ok()
    } else {
        digits.parse::<i32>().ok().map(|value| value as u32)
    };
    parsed.map(|value| i64::from(value as i32))
}

/// The value javac folds an expression to, for the booleans and `int`s a condition is made of.
fn folded(context: &Context, node: Node) -> Option<Fixed> {
    let node = crate::java::types::expr::unwrap(node);
    let truth = |node: Node| match folded(context, node) {
        Some(Fixed::Bool(value)) => Some(value),
        _ => None,
    };
    match node.kind() {
        "true" => Some(Fixed::Bool(true)),
        "false" => Some(Fixed::Bool(false)),
        "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" => integer(context.text(node)).map(Fixed::Int),
        "unary_expression" => match (context.text(node.child(0)?), folded(context, node.child_by_field_name("operand")?)?) {
            ("!", Fixed::Bool(value)) => Some(Fixed::Bool(!value)),
            ("-", Fixed::Int(value)) => Some(Fixed::Int(i64::from((value as i32).wrapping_neg()))),
            ("~", Fixed::Int(value)) => Some(Fixed::Int(i64::from(!(value as i32)))),
            _ => None,
        },
        "binary_expression" => {
            let operator = context.text(node.child_by_field_name("operator")?);
            let (left, right) = (node.child_by_field_name("left")?, node.child_by_field_name("right")?);
            match operator {
                "&&" => match truth(left)? {
                    false => Some(Fixed::Bool(false)),
                    true => truth(right).map(Fixed::Bool),
                },
                "||" => match truth(left)? {
                    true => Some(Fixed::Bool(true)),
                    false => truth(right).map(Fixed::Bool),
                },
                _ => match (folded(context, left)?, folded(context, right)?) {
                    (Fixed::Bool(a), Fixed::Bool(b)) => match operator {
                        "==" => Some(Fixed::Bool(a == b)),
                        "!=" | "^" => Some(Fixed::Bool(a != b)),
                        "&" => Some(Fixed::Bool(a & b)),
                        "|" => Some(Fixed::Bool(a | b)),
                        _ => None,
                    },
                    (Fixed::Int(a), Fixed::Int(b)) => Some(match operator {
                        "==" => Fixed::Bool(a == b),
                        "!=" => Fixed::Bool(a != b),
                        "<" => Fixed::Bool(a < b),
                        ">" => Fixed::Bool(a > b),
                        "<=" => Fixed::Bool(a <= b),
                        ">=" => Fixed::Bool(a >= b),
                        "+" => Fixed::Int(i64::from((a as i32).wrapping_add(b as i32))),
                        "-" => Fixed::Int(i64::from((a as i32).wrapping_sub(b as i32))),
                        "*" => Fixed::Int(i64::from((a as i32).wrapping_mul(b as i32))),
                        "/" if b != 0 => Fixed::Int(i64::from((a as i32).wrapping_div(b as i32))),
                        "%" if b != 0 => Fixed::Int(i64::from((a as i32).wrapping_rem(b as i32))),
                        "&" => Fixed::Int(a & b),
                        "|" => Fixed::Int(a | b),
                        "^" => Fixed::Int(a ^ b),
                        "<<" => Fixed::Int(i64::from((a as i32).wrapping_shl(b as u32))),
                        ">>" => Fixed::Int(i64::from((a as i32).wrapping_shr(b as u32))),
                        ">>>" => Fixed::Int(i64::from(((a as i32 as u32).wrapping_shr(b as u32)) as i32)),
                        _ => return None,
                    }),
                    _ => None,
                }
            }
        }
        "identifier" => match context.resolver.binding(node, context.text(node))? {
            crate::java::types::expr::Binding::Field(_, _, field) => field_value(field),
            crate::java::types::expr::Binding::Local(_) => None,
        },
        "field_access" => match context.resolver.receiver(node.child_by_field_name("object")?)? {
            crate::java::types::expr::Receiver::Static(owner) => field_value(context.resolver.index.field(&owner, context.text(node.child_by_field_name("field")?))?.1),
            _ => None,
        },
        _ => None,
    }
}

/// The value of a condition javac folds to `true` or `false`, which it makes no code for.
pub fn fixed(context: &Context, condition: Option<Node>) -> Option<bool> {
    match folded(context, condition?)? {
        Fixed::Bool(value) => Some(value),
        Fixed::Int(_) => None,
    }
}

/// The `int` value javac folds an expression to.
pub fn number(context: &Context, node: Node) -> Option<i64> {
    match folded(context, node)? {
        Fixed::Int(value) => Some(value),
        Fixed::Bool(_) => None,
    }
}
