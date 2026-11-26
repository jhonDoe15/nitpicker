//! The lock expressions that `@GuardedBy` annotations name.
use super::expr::unwrap;
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
    Int(i64),
    Char(char),
    Bool(bool),
    /// A field read by name: the classes to look in (an empty name stands for the class and those around it), the name.
    Name(Vec<String>, String),
    Add(Box<Expr>, Box<Expr>),
}

#[derive(Clone, Debug)]
enum Value {
    Str(String),
    Int(i64),
    Char(char),
    Bool(bool),
}

impl Value {
    fn shown(&self) -> String {
        match self {
            Value::Str(text) => text.clone(),
            Value::Int(number) => number.to_string(),
            Value::Char(c) => c.to_string(),
            Value::Bool(flag) => flag.to_string(),
        }
    }

    fn number(&self) -> Option<i64> {
        match self {
            Value::Int(number) => Some(*number),
            Value::Char(c) => Some(i64::from(u32::from(*c))),
            _ => None,
        }
    }
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

fn integer(text: &str) -> Option<i64> {
    let digits: String = text.chars().filter(|c| *c != '_').collect();
    let digits = digits.trim_end_matches(['l', 'L']);
    let lower = digits.to_ascii_lowercase();
    if let Some(hex) = lower.strip_prefix("0x") {
        return i64::from_str_radix(hex, 16).ok();
    }
    if let Some(binary) = lower.strip_prefix("0b") {
        return i64::from_str_radix(binary, 2).ok();
    }
    if lower.len() > 1 && lower.starts_with('0') {
        return i64::from_str_radix(&lower[1..], 8).ok();
    }
    lower.parse().ok()
}

impl Resolver<'_> {
    /// The constant a declaration's initializer or annotation value is, as far as it is made of literals, `+` and names.
    pub(super) fn fold(&self, node: Node) -> Option<Expr> {
        let node = unwrap(node);
        let text = self.file.text_of(node);
        match node.kind() {
            "string_literal" => super::expr::literal_text(self.file, node).map(Expr::Str),
            "character_literal" => character(text).map(Expr::Char),
            "true" => Some(Expr::Bool(true)),
            "false" => Some(Expr::Bool(false)),
            "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" => integer(text).map(Expr::Int),
            "binary_expression" if self.file.text_of(node.child_by_field_name("operator")?) == "+" => {
                let left = self.fold(node.child_by_field_name("left")?)?;
                Some(Expr::Add(Box::new(left), Box::new(self.fold(node.child_by_field_name("right")?)?)))
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

    fn constant(&self, expr: &Expr, class: &str, depth: usize) -> Option<Value> {
        match expr {
            Expr::Str(text) => Some(Value::Str(text.clone())),
            Expr::Int(number) => Some(Value::Int(*number)),
            Expr::Char(c) => Some(Value::Char(*c)),
            Expr::Bool(flag) => Some(Value::Bool(*flag)),
            Expr::Add(left, right) => {
                let (left, right) = (self.constant(left, class, depth)?, self.constant(right, class, depth)?);
                if matches!(left, Value::Str(_)) || matches!(right, Value::Str(_)) {
                    return Some(Value::Str(left.shown() + &right.shown()));
                }
                Some(Value::Int(left.number()?.checked_add(right.number()?)?))
            }
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
        if let Some(expr) = &field.folded {
            return self.constant(expr, owner, depth + 1);
        }
        let number = field.number;
        match (&field.kind, field.constant.as_deref()) {
            (Type::Primitive("boolean"), Some(flag)) => Some(Value::Bool(flag == "true")),
            (Type::Primitive("char"), _) => number.and_then(|n| char::from_u32(n as u32)).map(Value::Char),
            (Type::Primitive("float" | "double"), _) => None,
            (Type::Primitive(_), _) => number.map(Value::Int),
            (_, Some(text)) => Some(Value::Str(text.to_string())),
            _ => None,
        }
    }
}
