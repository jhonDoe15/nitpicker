//! Compile-time constant values of expressions, as far as literals, operators and constant fields of the same file give them.
use super::Context;
use crate::engine::source::{children, walk};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::expr::{Binding, Receiver, literal_text, unwrap};
use crate::java::types::model::Type;
use tree_sitter::Node;

#[derive(Clone, Debug, PartialEq)]
pub enum Const {
    Int(i32),
    Long(i64),
    Float(f32),
    Double(f64),
    Bool(bool),
    Char(u16),
    Str(String),
}

impl Const {
    fn rank(&self) -> Option<u8> {
        Some(match self {
            Const::Int(_) | Const::Char(_) => 0,
            Const::Long(_) => 1,
            Const::Float(_) => 2,
            Const::Double(_) => 3,
            _ => return None,
        })
    }
    fn as_i64(&self) -> Option<i64> {
        Some(match self {
            Const::Int(value) => i64::from(*value),
            Const::Long(value) => *value,
            Const::Char(value) => i64::from(*value),
            Const::Float(value) => *value as i64,
            Const::Double(value) => *value as i64,
            _ => return None,
        })
    }
    fn as_f64(&self) -> Option<f64> {
        Some(match self {
            Const::Float(value) => f64::from(*value),
            Const::Double(value) => *value,
            other => other.as_i64()? as f64,
        })
    }
    /// The number as the primitive type of the name, for a cast.
    fn cast(&self, to: &str) -> Option<Const> {
        let whole = |value: &Const| -> Option<i64> {
            match value {
                Const::Float(number) => Some(*number as i64),
                Const::Double(number) => Some(*number as i64),
                other => other.as_i64(),
            }
        };
        Some(match to {
            "int" => Const::Int(whole(self)? as i32),
            "long" => Const::Long(whole(self)?),
            "short" => Const::Int(whole(self)? as i16 as i32),
            "byte" => Const::Int(whole(self)? as i8 as i32),
            "char" => Const::Char(whole(self)? as u16),
            "float" => Const::Float(self.as_f64()? as f32),
            "double" => Const::Double(self.as_f64()?),
            _ => return None,
        })
    }
    /// The text javac gives when the value joins a string.
    fn shown(&self) -> String {
        match self {
            Const::Int(value) => value.to_string(),
            Const::Long(value) => value.to_string(),
            Const::Float(value) => value.to_string(),
            Const::Double(value) => value.to_string(),
            Const::Bool(value) => value.to_string(),
            Const::Char(value) => char::from_u32(u32::from(*value)).map(String::from).unwrap_or_default(),
            Const::Str(value) => value.clone(),
        }
    }
}

fn integer(text: &str) -> Option<Const> {
    let clean: String = text.chars().filter(|character| *character != '_').collect();
    let long = clean.ends_with(['l', 'L']);
    let body = clean.trim_end_matches(['l', 'L']);
    let (digits, radix) = if let Some(rest) = body.strip_prefix("0x").or_else(|| body.strip_prefix("0X")) {
        (rest, 16)
    } else if let Some(rest) = body.strip_prefix("0b").or_else(|| body.strip_prefix("0B")) {
        (rest, 2)
    } else if body.len() > 1 && body.starts_with('0') {
        (&body[1..], 8)
    } else {
        (body, 10)
    };
    let value = u64::from_str_radix(digits, radix).ok()?;
    if long {
        return Some(Const::Long(value as i64));
    }
    if radix == 10 && value > 2147483648 || value > 0xFFFF_FFFF {
        return None;
    }
    Some(Const::Int(value as u32 as i32))
}

fn floating(text: &str) -> Option<Const> {
    let clean: String = text.chars().filter(|character| *character != '_').collect();
    if clean.starts_with("0x") || clean.starts_with("0X") {
        return None;
    }
    if clean.ends_with(['f', 'F']) {
        return clean[..clean.len() - 1].parse().ok().map(Const::Float);
    }
    clean.trim_end_matches(['d', 'D']).parse().ok().map(Const::Double)
}

fn character(text: &str) -> Option<Const> {
    let inner = text.strip_prefix('\'')?.strip_suffix('\'')?;
    let mut chars = inner.chars();
    let first = chars.next()?;
    if first != '\\' {
        return Some(Const::Char(first as u32 as u16));
    }
    Some(Const::Char(match chars.next()? {
        'n' => 10,
        't' => 9,
        'r' => 13,
        'b' => 8,
        'f' => 12,
        's' => 32,
        '0'..='7' => u16::from_str_radix(&inner[1..], 8).ok()?,
        'u' => u16::from_str_radix(inner.trim_start_matches('\\').trim_start_matches('u'), 16).ok()?,
        other => other as u32 as u16,
    }))
}

fn unary(operator: &str, value: Const) -> Option<Const> {
    Some(match (operator, value) {
        ("!", Const::Bool(flag)) => Const::Bool(!flag),
        ("+", other) if other.rank().is_some() => promoted(other),
        ("-", Const::Int(number)) => Const::Int(number.wrapping_neg()),
        ("-", Const::Char(number)) => Const::Int(-i32::from(number)),
        ("-", Const::Long(number)) => Const::Long(number.wrapping_neg()),
        ("-", Const::Float(number)) => Const::Float(-number),
        ("-", Const::Double(number)) => Const::Double(-number),
        ("~", Const::Int(number)) => Const::Int(!number),
        ("~", Const::Char(number)) => Const::Int(!i32::from(number)),
        ("~", Const::Long(number)) => Const::Long(!number),
        _ => return None,
    })
}

fn promoted(value: Const) -> Const {
    match value {
        Const::Char(number) => Const::Int(i32::from(number)),
        other => other,
    }
}

fn binary(operator: &str, left: Const, right: Const) -> Option<Const> {
    if operator == "+" && (matches!(left, Const::Str(_)) || matches!(right, Const::Str(_))) {
        return Some(Const::Str(left.shown() + &right.shown()));
    }
    if let (Const::Bool(a), Const::Bool(b)) = (&left, &right) {
        return Some(Const::Bool(match operator {
            "&&" | "&" => *a && *b,
            "||" | "|" => *a || *b,
            "^" | "!=" => a != b,
            "==" => a == b,
            _ => return None,
        }));
    }
    if matches!(operator, "<<" | ">>" | ">>>") {
        let amount = right.as_i64()?;
        return Some(match promoted(left) {
            Const::Int(number) => {
                let by = (amount & 31) as u32;
                Const::Int(match operator {
                    "<<" => number.wrapping_shl(by),
                    ">>" => number.wrapping_shr(by),
                    _ => ((number as u32).wrapping_shr(by)) as i32,
                })
            }
            Const::Long(number) => {
                let by = (amount & 63) as u32;
                Const::Long(match operator {
                    "<<" => number.wrapping_shl(by),
                    ">>" => number.wrapping_shr(by),
                    _ => ((number as u64).wrapping_shr(by)) as i64,
                })
            }
            _ => return None,
        });
    }
    let rank = left.rank()?.max(right.rank()?);
    if rank >= 2 {
        let (a, b) = (left.as_f64()?, right.as_f64()?);
        let fits = |value: f64| if rank == 2 { Const::Float(value as f32) } else { Const::Double(value) };
        return Some(match operator {
            "+" => fits(a + b),
            "-" => fits(a - b),
            "*" => fits(a * b),
            "/" => fits(a / b),
            "%" => fits(a % b),
            "<" => Const::Bool(a < b),
            ">" => Const::Bool(a > b),
            "<=" => Const::Bool(a <= b),
            ">=" => Const::Bool(a >= b),
            "==" => Const::Bool(a == b),
            "!=" => Const::Bool(a != b),
            _ => return None,
        });
    }
    let (a, b) = (left.as_i64()?, right.as_i64()?);
    let whole = |value: i64| if rank == 1 { Const::Long(value) } else { Const::Int(value as i32) };
    let (x, y) = if rank == 1 { (a, b) } else { (i64::from(a as i32), i64::from(b as i32)) };
    Some(match operator {
        "+" => whole(x.wrapping_add(y)),
        "-" => whole(x.wrapping_sub(y)),
        "*" => whole(if rank == 1 { x.wrapping_mul(y) } else { i64::from((x as i32).wrapping_mul(y as i32)) }),
        "/" if y != 0 => whole(if rank == 1 { x.wrapping_div(y) } else { i64::from((x as i32).wrapping_div(y as i32)) }),
        "%" if y != 0 => whole(if rank == 1 { x.wrapping_rem(y) } else { i64::from((x as i32).wrapping_rem(y as i32)) }),
        "&" => whole(x & y),
        "|" => whole(x | y),
        "^" => whole(x ^ y),
        "<" => Const::Bool(x < y),
        ">" => Const::Bool(x > y),
        "<=" => Const::Bool(x <= y),
        ">=" => Const::Bool(x >= y),
        "==" => Const::Bool(x == y),
        "!=" => Const::Bool(x != y),
        _ => return None,
    })
}

/// The initializer of a constant field written in this file.
fn field_initializer<'a>(context: &Context<'a>, class: &str, name: &str) -> Option<Node<'a>> {
    let root = context.file.tree.root_node();
    let mut found = None;
    walk(root, |node| {
        if found.is_some() || !matches!(node.kind(), "field_declaration" | "constant_declaration") {
            return;
        }
        let owner = crate::engine::source::parent(node).and_then(crate::engine::source::parent);
        if owner.and_then(|owner| context.resolver.scope.names.get(&owner.id())).is_none_or(|own| own != class) {
            return;
        }
        let interface = owner.is_some_and(|owner| matches!(owner.kind(), "interface_declaration" | "annotation_type_declaration"));
        if !interface && !has_modifier(node, "final") {
            return;
        }
        for declarator in declarators(node) {
            if declarator.child_by_field_name("name").is_some_and(|written| context.text(written) == name) {
                found = declarator.child_by_field_name("value");
            }
        }
    });
    found
}

/// The constants of the JDK classes that code commonly uses; the class files give no numeric values here.
fn library_value(class: &str, name: &str) -> Option<Const> {
    Some(match (class, name) {
        ("java.lang.Integer", "MAX_VALUE") => Const::Int(i32::MAX),
        ("java.lang.Integer", "MIN_VALUE") => Const::Int(i32::MIN),
        ("java.lang.Integer", "SIZE") => Const::Int(32),
        ("java.lang.Integer", "BYTES") => Const::Int(4),
        ("java.lang.Long", "MAX_VALUE") => Const::Long(i64::MAX),
        ("java.lang.Long", "MIN_VALUE") => Const::Long(i64::MIN),
        ("java.lang.Long", "SIZE") => Const::Int(64),
        ("java.lang.Long", "BYTES") => Const::Int(8),
        ("java.lang.Short", "MAX_VALUE") => Const::Int(i32::from(i16::MAX)),
        ("java.lang.Short", "MIN_VALUE") => Const::Int(i32::from(i16::MIN)),
        ("java.lang.Short", "SIZE") => Const::Int(16),
        ("java.lang.Short", "BYTES") => Const::Int(2),
        ("java.lang.Byte", "MAX_VALUE") => Const::Int(127),
        ("java.lang.Byte", "MIN_VALUE") => Const::Int(-128),
        ("java.lang.Byte", "SIZE") => Const::Int(8),
        ("java.lang.Byte", "BYTES") => Const::Int(1),
        ("java.lang.Character", "MAX_VALUE") => Const::Char(u16::MAX),
        ("java.lang.Character", "MIN_VALUE") => Const::Char(0),
        ("java.lang.Character", "SIZE") => Const::Int(16),
        ("java.lang.Character", "BYTES") => Const::Int(2),
        ("java.lang.Float", "MAX_VALUE") => Const::Float(f32::MAX),
        ("java.lang.Float", "SIZE") => Const::Int(32),
        ("java.lang.Float", "BYTES") => Const::Int(4),
        ("java.lang.Double", "MAX_VALUE") => Const::Double(f64::MAX),
        ("java.lang.Double", "SIZE") => Const::Int(64),
        ("java.lang.Double", "BYTES") => Const::Int(8),
        ("java.lang.Math", "PI") => Const::Double(std::f64::consts::PI),
        ("java.lang.Math", "E") => Const::Double(std::f64::consts::E),
        _ => return None,
    })
}

fn field_value(context: &Context, class: &str, name: &str, declared: &Type, depth: usize) -> Option<Const> {
    if let Some(found) = library_value(class, name) {
        return Some(found);
    }
    let value = field_initializer(context, class, name)?;
    let result = evaluate(context, value, depth + 1)?;
    match declared {
        Type::Primitive(kind) => result.cast(kind).or(Some(result).filter(|_| *kind == "boolean")),
        Type::Class(own, _) if own == "java.lang.String" => matches!(result, Const::Str(_)).then_some(result),
        _ => None,
    }
}

/// A final String field of another class whose initializer is made of literals.
fn string_constant(field: &crate::java::types::model::Field) -> Option<Const> {
    let text = field.constant.as_ref()?;
    matches!(&field.kind, Type::Class(name, _) if name == "java.lang.String").then(|| Const::Str(text.clone()))
}

fn name_value(context: &Context, node: Node, depth: usize) -> Option<Const> {
    if depth > 20 {
        return None;
    }
    match node.kind() {
        "identifier" => match context.resolver.binding(node, context.text(node))? {
            Binding::Field(_, info, field) => field_value(context, &info.name, &field.name, &field.kind, depth).or_else(|| string_constant(field)),
            Binding::Local(_) => local_value(context, node, depth),
        },
        "field_access" => {
            let name = context.text(node.child_by_field_name("field")?);
            match context.resolver.receiver(node.child_by_field_name("object")?)? {
                Receiver::Static(owner) => {
                    let (info, field) = context.resolver.index.field(&owner, name)?;
                    field_value(context, &info.name, name, &field.kind, depth).or_else(|| string_constant(field))
                }
                _ => None,
            }
        }
        _ => None,
    }
}

/// A final local variable with a constant initializer.
fn local_value(context: &Context, usage: Node, depth: usize) -> Option<Const> {
    let name = context.text(usage);
    let mut inner = usage;
    while let Some(scope) = crate::engine::source::parent(inner) {
        for statement in children(scope).into_iter().filter(|part| part.kind() == "local_variable_declaration" && part.end_byte() <= usage.start_byte()) {
            for declarator in declarators(statement) {
                if declarator.child_by_field_name("name").is_some_and(|written| context.text(written) == name) {
                    if !has_modifier(statement, "final") {
                        return None;
                    }
                    let kind = context.resolver.declared_type(statement, Some(declarator))?;
                    let value = evaluate(context, declarator.child_by_field_name("value")?, depth + 1)?;
                    return match kind {
                        Type::Primitive(own) => value.cast(own).or(Some(value).filter(|_| own == "boolean")),
                        Type::Class(own, _) if own == "java.lang.String" => matches!(value, Const::Str(_)).then_some(value),
                        _ => None,
                    };
                }
            }
        }
        if matches!(scope.kind(), "method_declaration" | "constructor_declaration" | "lambda_expression" | "class_body") {
            return None;
        }
        inner = scope;
    }
    None
}

fn evaluate(context: &Context, node: Node, depth: usize) -> Option<Const> {
    let node = unwrap(node);
    let text = context.text(node);
    match node.kind() {
        "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" => integer(text),
        "decimal_floating_point_literal" | "hex_floating_point_literal" => floating(text),
        "true" => Some(Const::Bool(true)),
        "false" => Some(Const::Bool(false)),
        "character_literal" => character(text),
        "string_literal" => literal_text(context.file, node).map(Const::Str),
        "unary_expression" => {
            let operator = context.text(node.child_by_field_name("operator")?);
            let operand = node.child_by_field_name("operand")?;
            if operator == "-" && matches!(operand.kind(), "decimal_integer_literal") {
                let negated = format!("-{}", context.text(operand));
                if let Ok(value) = negated.trim_end_matches(['l', 'L']).replace('_', "").parse::<i64>() {
                    return Some(if negated.ends_with(['l', 'L']) { Const::Long(value) } else { Const::Int(value as i32) });
                }
            }
            unary(operator, evaluate(context, operand, depth)?)
        }
        "binary_expression" => {
            let operator = context.text(node.child_by_field_name("operator")?);
            let left = evaluate(context, node.child_by_field_name("left")?, depth)?;
            let right = evaluate(context, node.child_by_field_name("right")?, depth)?;
            binary(operator, left, right)
        }
        "ternary_expression" => {
            let Const::Bool(test) = evaluate(context, node.child_by_field_name("condition")?, depth)? else { return None };
            let chosen = if test { "consequence" } else { "alternative" };
            let other = if test { "alternative" } else { "consequence" };
            let (a, b) = (evaluate(context, node.child_by_field_name(chosen)?, depth)?, evaluate(context, node.child_by_field_name(other)?, depth)?);
            if a.rank().is_some() && b.rank().is_some() && a.rank() != b.rank() {
                return None;
            }
            Some(a)
        }
        "cast_expression" => {
            let kind = node.child_by_field_name("type")?;
            let value = evaluate(context, node.child_by_field_name("value")?, depth)?;
            match context.text(kind) {
                "String" | "java.lang.String" => matches!(value, Const::Str(_)).then_some(value),
                "boolean" => matches!(value, Const::Bool(_)).then_some(value),
                primitive => value.cast(primitive),
            }
        }
        "identifier" | "field_access" => name_value(context, node, depth),
        _ => None,
    }
}

/// The constant an expression stands for, when javac would fold it.
pub fn constant(context: &Context, node: Node) -> Option<Const> {
    evaluate(context, node, 0)
}
