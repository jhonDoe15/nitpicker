//! `literal-condition.mts`: whether a condition folds to a value without running the code, with JavaScript's
//! own conversions, so that `skipIf(1 + 1 === 2)` counts as fixed.
use crate::typescript::rules::support::view::{Node, Value};
use oxc_syntax::number::ToJsString;

const MAX_DEPTH: usize = 40;

#[derive(Clone, PartialEq, Debug)]
enum Js {
    Undefined,
    Null,
    Bool(bool),
    Number(f64),
    Text(Vec<u16>),
}

fn truthy(value: &Js) -> bool {
    match value {
        Js::Undefined | Js::Null => false,
        Js::Bool(flag) => *flag,
        Js::Number(number) => *number != 0.0 && !number.is_nan(),
        Js::Text(text) => !text.is_empty(),
    }
}

fn is_space(character: char) -> bool {
    matches!(character, '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

fn radix_number(digits: &str, radix: u32) -> f64 {
    if digits.is_empty() || !digits.chars().all(|digit| digit.is_digit(radix)) {
        return f64::NAN;
    }
    digits.chars().fold(0.0, |value, digit| value * f64::from(radix) + f64::from(digit.to_digit(radix).unwrap_or(0)))
}

fn is_decimal(text: &str) -> bool {
    let body = text.strip_prefix(['+', '-']).unwrap_or(text);
    let (mantissa, exponent) = match body.find(['e', 'E']) {
        Some(at) => (&body[..at], Some(&body[at + 1..])),
        None => (body, None),
    };
    let (whole, fraction) = mantissa.split_once('.').unwrap_or((mantissa, ""));
    let digits = |part: &str| part.chars().all(|digit| digit.is_ascii_digit());
    let mantissa_ok = digits(whole) && digits(fraction) && !(whole.is_empty() && fraction.is_empty());
    let exponent_ok = exponent.is_none_or(|exponent| {
        let unsigned = exponent.strip_prefix(['+', '-']).unwrap_or(exponent);
        !unsigned.is_empty() && digits(unsigned)
    });
    mantissa_ok && exponent_ok
}

fn text_number(text: &str) -> f64 {
    let trimmed = text.trim_matches(is_space);
    if trimmed.is_empty() {
        return 0.0;
    }
    for (prefix, radix) in [("0x", 16), ("0X", 16), ("0o", 8), ("0O", 8), ("0b", 2), ("0B", 2)] {
        if let Some(digits) = trimmed.strip_prefix(prefix) {
            return radix_number(digits, radix);
        }
    }
    match trimmed {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    if !is_decimal(trimmed) {
        return f64::NAN;
    }
    let body = trimmed.strip_prefix('+').unwrap_or(trimmed);
    let (sign, unsigned) = body.strip_prefix('-').map_or((1.0, body), |rest| (-1.0, rest));
    let normalized = if unsigned.starts_with('.') { format!("0{unsigned}") } else { unsigned.to_string() };
    let normalized = normalized.replace(".e", ".0e").replace(".E", ".0E");
    let normalized = if normalized.ends_with('.') { format!("{normalized}0") } else { normalized };
    sign * normalized.parse::<f64>().unwrap_or(f64::NAN)
}

fn number(value: &Js) -> f64 {
    match value {
        Js::Undefined => f64::NAN,
        Js::Null => 0.0,
        Js::Bool(flag) => f64::from(u8::from(*flag)),
        Js::Number(number) => *number,
        Js::Text(text) => text_number(&String::from_utf16_lossy(text)),
    }
}

fn string(value: &Js) -> Vec<u16> {
    match value {
        Js::Undefined => "undefined".encode_utf16().collect(),
        Js::Null => "null".encode_utf16().collect(),
        Js::Bool(flag) => flag.to_string().encode_utf16().collect(),
        Js::Number(number) => number.to_js_string().encode_utf16().collect(),
        Js::Text(text) => text.clone(),
    }
}

fn type_of(value: &Js) -> &'static str {
    match value {
        Js::Undefined => "undefined",
        Js::Null => "object",
        Js::Bool(_) => "boolean",
        Js::Number(_) => "number",
        Js::Text(_) => "string",
    }
}

fn int32(number: f64) -> i32 {
    if !number.is_finite() {
        return 0;
    }
    (number.trunc().rem_euclid(4_294_967_296.0) as u32) as i32
}

fn strictly_equal(left: &Js, right: &Js) -> bool {
    match (left, right) {
        (Js::Number(left), Js::Number(right)) => left == right,
        _ => left == right,
    }
}

fn nullish(value: &Js) -> bool {
    matches!(value, Js::Undefined | Js::Null)
}

fn loosely_equal(left: &Js, right: &Js) -> Option<Js> {
    if nullish(left) && nullish(right) {
        return Some(Js::Bool(true));
    }
    (type_of(left) == type_of(right) && !nullish(left)).then(|| Js::Bool(strictly_equal(left, right)))
}

fn compare(left: &Js, right: &Js, test: fn(std::cmp::Ordering) -> bool, numbers: fn(f64, f64) -> bool) -> Js {
    if let (Js::Text(left), Js::Text(right)) = (left, right) {
        return Js::Bool(test(left.cmp(right)));
    }
    Js::Bool(numbers(number(left), number(right)))
}

fn binary(operator: &str, left: &Js, right: &Js) -> Option<Js> {
    let arithmetic = |apply: fn(f64, f64) -> f64| Some(Js::Number(apply(number(left), number(right))));
    match operator {
        "==" => loosely_equal(left, right),
        "!=" => loosely_equal(left, right).map(|equal| Js::Bool(!truthy(&equal))),
        "===" => Some(Js::Bool(strictly_equal(left, right))),
        "!==" => Some(Js::Bool(!strictly_equal(left, right))),
        "<" => Some(compare(left, right, std::cmp::Ordering::is_lt, |left, right| left < right)),
        "<=" => Some(compare(left, right, std::cmp::Ordering::is_le, |left, right| left <= right)),
        ">" => Some(compare(left, right, std::cmp::Ordering::is_gt, |left, right| left > right)),
        ">=" => Some(compare(left, right, std::cmp::Ordering::is_ge, |left, right| left >= right)),
        "+" if matches!(left, Js::Text(_)) || matches!(right, Js::Text(_)) => Some(Js::Text([string(left), string(right)].concat())),
        "+" => arithmetic(|left, right| left + right),
        "-" => arithmetic(|left, right| left - right),
        "*" => arithmetic(|left, right| left * right),
        "/" => arithmetic(|left, right| left / right),
        "%" => arithmetic(|left, right| left % right),
        _ => None,
    }
}

fn unary(operator: &str, value: &Js) -> Option<Js> {
    match operator {
        "!" => Some(Js::Bool(!truthy(value))),
        "-" => Some(Js::Number(-number(value))),
        "+" => Some(Js::Number(number(value))),
        "~" => Some(Js::Number(f64::from(!int32(number(value))))),
        "typeof" => Some(Js::Text(type_of(value).encode_utf16().collect())),
        _ => None,
    }
}

fn literal(node: Node) -> Option<Js> {
    if node.has("regex") && node.get("regex") != Value::Null || node.has("bigint") && node.get("bigint") != Value::Null {
        return None;
    }
    match node.get("value") {
        Value::Null => Some(Js::Null),
        Value::Bool(flag) => Some(Js::Bool(flag)),
        Value::Number(number) => Some(Js::Number(number)),
        text @ Value::Text(..) => node.view.utf16(text).map(Js::Text),
        _ => None,
    }
}

fn template(node: Node) -> Option<Js> {
    if !node.nodes("expressions").is_empty() {
        return None;
    }
    let quasi = node.nodes("quasis").into_iter().next();
    match quasi.map(|quasi| quasi.get("value")) {
        Some(Value::Node(index)) => match node.view.at(index).get("cooked") {
            Value::Null => Some(Js::Null),
            cooked => node.view.utf16(cooked).map(Js::Text),
        },
        _ => Some(Js::Undefined),
    }
}

fn fold(node: Option<Node>, depth: usize) -> Option<Js> {
    let node = node?;
    if depth > MAX_DEPTH {
        return None;
    }
    let next = depth + 1;
    match node.kind() {
        "Literal" => literal(node),
        "Identifier" => match node.name().as_deref() {
            Some("undefined") => Some(Js::Undefined),
            Some("NaN") => Some(Js::Number(f64::NAN)),
            Some("Infinity") => Some(Js::Number(f64::INFINITY)),
            _ => None,
        },
        "TemplateLiteral" => template(node),
        "UnaryExpression" => {
            let operator = node.text("operator").unwrap_or_default();
            if operator == "void" {
                return Some(Js::Undefined);
            }
            if !matches!(operator.as_ref(), "!" | "-" | "+" | "~" | "typeof") {
                return None;
            }
            unary(&operator, &fold(node.node("argument"), next)?)
        }
        "BinaryExpression" => {
            let operator = node.text("operator").unwrap_or_default();
            let left = fold(node.node("left"), next);
            let right = fold(node.node("right"), next);
            binary(&operator, &left?, &right?)
        }
        "LogicalExpression" => {
            let left = fold(node.node("left"), next)?;
            let decided = match node.text("operator").as_deref() {
                Some("&&") => !truthy(&left),
                Some("||") => truthy(&left),
                Some("??") => !nullish(&left),
                _ => false,
            };
            if decided { Some(left) } else { fold(node.node("right"), next) }
        }
        "ConditionalExpression" => {
            let test = fold(node.node("test"), next)?;
            fold(node.node(if truthy(&test) { "consequent" } else { "alternate" }), next)
        }
        _ => None,
    }
}

/// `isLiteralCondition`.
pub fn is_literal_condition(node: Option<Node>) -> bool {
    fold(node, 0).is_some()
}
