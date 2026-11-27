//! The lock expressions that `@GuardedBy` annotations name.
use super::constant::{Constant, cast, infix, literal, unary};
use super::expr::unwrap;
use crate::java::errorprone::java_text::{double_to_string, float_to_string};
use super::index::TypeIndex;
use super::model::Type;
use super::scope::{Resolver, enclosing_type};
use crate::engine::source::children;
use tree_sitter::Node;

/// The `@GuardedBy` annotations Error Prone reads.
pub const GUARDED_BY: &[&str] = &[
    "android.support.annotation.GuardedBy",
    "androidx.annotation.GuardedBy",
    "com.android.internal.annotations.GuardedBy",
    "com.google.errorprone.annotations.concurrent.GuardedBy",
    "javax.annotation.concurrent.GuardedBy",
];

/// A constant expression an annotation value is written as: its names are read when the value is needed.
#[derive(Clone, Debug, PartialEq)]
pub enum Expr {
    Str(String),
    Num(Constant),
    /// A field read by name: the classes to look in (an empty name stands for the class and those around it), the name.
    Name(Vec<String>, String),
    Unary(String, Box<Expr>),
    Binary(String, Box<Expr>, Box<Expr>),
    Conditional(Box<Expr>, Box<Expr>, Box<Expr>),
    Cast(String, Box<Expr>),
}

#[derive(Clone, Debug)]
enum Value {
    Str(String),
    Num(Constant),
    /// A `byte` or `short` value: an `int` for arithmetic, but not an `int` constant beside a `char` (JLS 15.25).
    Small(i32),
}

impl Value {
    /// The text string conversion gives the value (JLS 5.1.11).
    fn shown(&self) -> String {
        match self {
            Value::Str(text) => text.clone(),
            Value::Num(Constant::Int(number)) => number.to_string(),
            Value::Num(Constant::Long(number)) => number.to_string(),
            Value::Num(Constant::Float(number)) => float_to_string(*number),
            Value::Num(Constant::Double(number)) => double_to_string(*number),
            Value::Num(Constant::Char(unit)) => String::from_utf16_lossy(&[*unit]),
            Value::Num(Constant::Bool(flag)) => flag.to_string(),
            Value::Small(number) => number.to_string(),
        }
    }
}

/// A value of the primitive type `kind`, marking `byte` and `short` values.
fn small(kind: &str, value: Constant) -> Option<Value> {
    match (kind, value) {
        ("byte" | "short", Constant::Int(number)) => Some(Value::Small(number)),
        (_, value) => Some(Value::Num(value)),
    }
}

/// Java's comparison of two numbers where one is a `float` or a `double`: IEEE 754, so `0.0 == -0.0` and no `NaN`
/// compares true.
fn real_compare(operator: &str, left: Constant, right: Constant) -> Option<Constant> {
    let real = |value: Constant| matches!(value, Constant::Float(_) | Constant::Double(_));
    if !real(left) && !real(right) || matches!(left, Constant::Bool(_)) || matches!(right, Constant::Bool(_)) {
        return None;
    }
    let wide = if matches!(left, Constant::Double(_)) || matches!(right, Constant::Double(_)) { "double" } else { "float" };
    let as_double = |value: Constant| match cast(wide, value)? {
        Constant::Float(number) => Some(f64::from(number)),
        Constant::Double(number) => Some(number),
        _ => None,
    };
    let (a, b) = (as_double(left)?, as_double(right)?);
    Some(Constant::Bool(match operator {
        "==" => a == b,
        "!=" => a != b,
        "<" => a < b,
        "<=" => a <= b,
        ">" => a > b,
        ">=" => a >= b,
        _ => return None,
    }))
}

/// The type a conditional of two numeric constants has (JLS 15.25): a `char` beside an `int` constant it can hold
/// stays a `char`, otherwise both take the wider type.
fn conditional_kind(first: Constant, second: Constant) -> Option<&'static str> {
    let rank = |value: Constant| match value {
        Constant::Char(_) => Some(0),
        Constant::Int(_) => Some(1),
        Constant::Long(_) => Some(2),
        Constant::Float(_) => Some(3),
        Constant::Double(_) => Some(4),
        Constant::Bool(_) => None,
    };
    let fits = |value: Constant| matches!(value, Constant::Int(number) if u16::try_from(number).is_ok());
    Some(match (rank(first)?, rank(second)?) {
        (0, 0) => "char",
        (0, 1) if fits(second) => "char",
        (1, 0) if fits(first) => "char",
        (a, b) => ["int", "int", "long", "float", "double"][a.max(b)],
    })
}

fn character(text: &str) -> Option<char> {
    let inner = text.strip_prefix('\'')?.strip_suffix('\'')?;
    let mut chars = inner.chars();
    let first = chars.next()?;
    if first != '\\' {
        return chars.next().is_none().then_some(first);
    }
    let rest: String = chars.collect();
    match rest.as_str() {
        "n" => Some('\n'),
        "t" => Some('\t'),
        "r" => Some('\r'),
        "b" => Some('\u{8}'),
        "f" => Some('\u{c}'),
        "s" => Some(' '),
        "\\" => Some('\\'),
        "'" => Some('\''),
        "\"" => Some('"'),
        _ => {
            let digits = rest.trim_start_matches('u');
            let (digits, radix) = if digits.len() < rest.len() { (digits, 16) } else { (digits, 8) };
            u32::from_str_radix(digits, radix).ok().and_then(char::from_u32)
        }
    }
}

impl Resolver<'_> {
    /// The constant expression a declaration's initializer or annotation value is, as written (JLS 15.29).
    pub(super) fn fold(&self, node: Node) -> Option<Expr> {
        let node = unwrap(node);
        let text = self.file.text_of(node);
        let part = |field: &str| node.child_by_field_name(field).and_then(|inner| self.fold(inner)).map(Box::new);
        let operator = || node.child_by_field_name("operator").map(|operator| self.file.text_of(operator).to_string());
        match node.kind() {
            "string_literal" => super::expr::literal_text(self.file, node).map(Expr::Str),
            "character_literal" => character(text).and_then(|c| u16::try_from(u32::from(c)).ok()).map(|unit| Expr::Num(Constant::Char(unit))),
            "true" => Some(Expr::Num(Constant::Bool(true))),
            "false" => Some(Expr::Num(Constant::Bool(false))),
            "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" => Some(Expr::Num(literal(text, true).constant())),
            "decimal_floating_point_literal" | "hex_floating_point_literal" => Some(Expr::Num(literal(text, false).constant())),
            "unary_expression" => Some(Expr::Unary(operator()?, part("operand")?)),
            "binary_expression" => Some(Expr::Binary(operator()?, part("left")?, part("right")?)),
            "ternary_expression" => Some(Expr::Conditional(part("condition")?, part("consequence")?, part("alternative")?)),
            "cast_expression" => {
                let kind = node.child_by_field_name("type")?;
                let written = match kind.kind() {
                    "integral_type" | "floating_point_type" | "boolean_type" => self.file.text_of(kind).to_string(),
                    _ if self.class_name(kind, self.file.text_of(kind)).as_deref() == Some("java.lang.String") => "String".to_string(),
                    _ => return None,
                };
                Some(Expr::Cast(written, part("value")?))
            }
            "identifier" => {
                let mut owners = vec![String::new()];
                owners.extend(self.scope.static_single.get(text).into_iter().flatten().cloned());
                owners.extend(self.scope.static_on_demand.iter().cloned());
                Some(Expr::Name(owners, text.to_string()))
            }
            "field_access" | "scoped_identifier" => {
                let written: String = text.split_whitespace().collect();
                let (owner, name) = written.rsplit_once('.')?;
                Some(Expr::Name(vec![self.class_name(node, owner)?], name.to_string()))
            }
            _ => None,
        }
    }

    fn strings(&self, value: Node, into: &mut Vec<Expr>) {
        if value.kind() == "element_value_array_initializer" {
            for part in children(value).into_iter().filter(|part| part.is_named() && !part.kind().ends_with("comment")) {
                self.strings(part, into);
            }
        } else if let Some(expr) = self.fold(value) {
            into.push(expr);
        }
    }

    /// The `@GuardedBy` values of a declaration, in order, as constants still to be read.
    pub fn guard_exprs(&self, declaration: Node) -> Vec<Expr> {
        let mut found: Vec<Expr> = Vec::new();
        let Some(modifiers) = super::super::helpers::modifiers(declaration) else { return found };
        for annotation in children(modifiers).into_iter().filter(|part| part.kind() == "annotation") {
            let Some(name) = annotation.child_by_field_name("name") else { continue };
            let written = self.file.text_of(name);
            if !written.ends_with("GuardedBy") || !self.class_name(declaration, written).is_some_and(|full| GUARDED_BY.contains(&full.as_str())) {
                continue;
            }
            let Some(list) = annotation.child_by_field_name("arguments") else { continue };
            for part in children(list).into_iter().filter(|part| part.is_named() && !part.kind().ends_with("comment")) {
                let value = match part.kind() {
                    "element_value_pair" => part.child_by_field_name("key").filter(|key| self.file.text_of(*key) == "value").and_then(|_| part.child_by_field_name("value")),
                    _ => Some(part),
                };
                if let Some(value) = value {
                    self.strings(value, &mut found);
                }
            }
        }
        found
    }

    /// The values of the `@GuardedBy` annotations of a declaration, in order and without repeats.
    pub fn guard_values(&self, declaration: Node) -> Vec<String> {
        let exprs = self.guard_exprs(declaration);
        match enclosing_type(self.file, self.scope, declaration) {
            Some(class) if !exprs.is_empty() => self.index.guard_texts(&class, &exprs),
            _ => Vec::new(),
        }
    }
}

impl TypeIndex {
    /// The strings of guard constants read from the members of `class`, in order and without repeats.
    pub fn guard_texts(&self, class: &str, guards: &[Expr]) -> Vec<String> {
        let mut found: Vec<String> = Vec::new();
        for guard in guards {
            if let Some(Value::Str(text)) = self.constant(guard, class, 0) {
                if !found.contains(&text) {
                    found.push(text);
                }
            }
        }
        found
    }

    /// The string a constant expression of a member of `class` folds to.
    pub fn constant_text(&self, expr: &Expr, class: &str) -> Option<String> {
        match self.constant(expr, class, 0)? {
            Value::Str(text) => Some(text),
            _ => None,
        }
    }

    fn constant(&self, expr: &Expr, class: &str, depth: usize) -> Option<Value> {
        let number = |part: &Expr| match self.constant(part, class, depth)? {
            Value::Num(value) => Some(value),
            Value::Small(value) => Some(Constant::Int(value)),
            Value::Str(_) => None,
        };
        match expr {
            Expr::Str(text) => Some(Value::Str(text.clone())),
            Expr::Num(value) => Some(Value::Num(*value)),
            Expr::Binary(operator, left_expr, right_expr) if operator == "+" => {
                let (left, right) = (self.constant(left_expr, class, depth)?, self.constant(right_expr, class, depth)?);
                match (&left, &right) {
                    (Value::Str(_), _) | (_, Value::Str(_)) => Some(Value::Str(left.shown() + &right.shown())),
                    _ => infix("+", number(left_expr)?, number(right_expr)?).ok().flatten().map(Value::Num),
                }
            }
            Expr::Binary(operator, left, right) if matches!(operator.as_str(), "==" | "!=") && matches!(self.constant(left, class, depth), Some(Value::Str(_))) => {
                let (Some(Value::Str(a)), Some(Value::Str(b))) = (self.constant(left, class, depth), self.constant(right, class, depth)) else { return None };
                Some(Value::Num(Constant::Bool((a == b) == (operator == "=="))))
            }
            Expr::Binary(operator, left, right) => {
                let (left, right) = (number(left)?, number(right)?);
                real_compare(operator, left, right).or_else(|| infix(operator, left, right).ok().flatten()).map(Value::Num)
            }
            Expr::Unary(operator, operand) => unary(operator, number(operand)?).map(Value::Num),
            Expr::Conditional(condition, first, second) => {
                let Constant::Bool(flag) = number(condition)? else { return None };
                let (first, second) = (self.constant(first, class, depth)?, self.constant(second, class, depth)?);
                let chosen = if flag { &first } else { &second };
                let numeric = |value: &Value| match value {
                    Value::Num(Constant::Bool(_)) | Value::Str(_) => None,
                    Value::Num(value) => Some((*value, false)),
                    Value::Small(value) => Some((Constant::Int(*value), true)),
                };
                match (numeric(&first), numeric(&second)) {
                    (Some((a, a_small)), Some((b, b_small))) => {
                        let kind = match (a, b) {
                            (Constant::Char(_), _) if b_small => "int",
                            (_, Constant::Char(_)) if a_small => "int",
                            _ => conditional_kind(a, b)?,
                        };
                        let value = numeric(chosen)?.0;
                        match value {
                            Constant::Int(number) if a_small && b_small => Some(Value::Small(number)),
                            _ => cast(kind, value).map(Value::Num),
                        }
                    }
                    (None, None) if matches!((&first, &second), (Value::Num(_), Value::Num(_)) | (Value::Str(_), Value::Str(_))) => Some(chosen.clone()),
                    _ => None,
                }
            }
            Expr::Cast(kind, value) if kind == "String" => match self.constant(value, class, depth)? {
                Value::Str(text) => Some(Value::Str(text)),
                _ => None,
            },
            Expr::Cast(kind, value) => match (kind.as_str(), number(value)?) {
                ("boolean", Constant::Bool(flag)) => Some(Value::Num(Constant::Bool(flag))),
                ("boolean", _) => None,
                (kind, value) => small(kind, cast(kind, value)?),
            },
            Expr::Name(owners, name) => {
                if depth > 12 {
                    return None;
                }
                for owner in owners {
                    let places: Vec<String> = if owner.is_empty() { self.around(class) } else { vec![owner.clone()] };
                    for place in places {
                        if let Some((info, field)) = self.field(&place, name) {
                            return self.field_constant(&info.name, field, depth);
                        }
                    }
                }
                None
            }
        }
    }

    /// The class and the classes it is declared in, innermost first.
    fn around(&self, class: &str) -> Vec<String> {
        let mut places = vec![class.to_string()];
        let mut at = class;
        while let Some((outer, _)) = at.rsplit_once('.') {
            if self.has(outer) {
                places.push(outer.to_string());
            }
            at = outer;
        }
        places
    }

    fn field_constant(&self, owner: &str, field: &super::model::Field, depth: usize) -> Option<Value> {
        let kind = field.kind.name();
        if !matches!(field.kind, Type::Primitive(_)) && kind != "java.lang.String" {
            return None;
        }
        if let Some(found) = field.folded.as_ref().and_then(|expr| self.constant(expr, owner, depth + 1)) {
            return match (&field.kind, found) {
                (Type::Primitive(primitive), Value::Num(value)) => small(primitive, cast(primitive, value).unwrap_or(value)),
                (Type::Primitive(primitive), Value::Small(value)) => small(primitive, cast(primitive, Constant::Int(value))?),
                (_, found) => Some(found),
            };
        }
        let number = field.number;
        match (&field.kind, field.constant.as_deref()) {
            (Type::Primitive("boolean"), Some(flag)) => Some(Value::Num(Constant::Bool(flag == "true"))),
            (Type::Primitive("char"), _) => number.map(|n| Value::Num(Constant::Char(n as u16))),
            (Type::Primitive("float"), _) => number.map(|n| Value::Num(Constant::Float(f32::from_bits(n as u32)))),
            (Type::Primitive("double"), _) => number.map(|n| Value::Num(Constant::Double(f64::from_bits(n as u64)))),
            (Type::Primitive("long"), _) => number.map(|n| Value::Num(Constant::Long(n))),
            (Type::Primitive(primitive), _) => number.and_then(|n| small(primitive, Constant::Int(n as i32))),
            (_, Some(text)) => Some(Value::Str(text.to_string())),
            _ => None,
        }
    }
}
