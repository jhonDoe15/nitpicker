//! BigDecimalLiteralDouble: `new BigDecimal(0.1)` and the exact value it stands for.
use super::consts::{constant, Const};
use super::fixes::Fix;
use super::parts::{arguments, class_of};
use super::Context;
use tree_sitter::Node;

/// A non-negative integer as base 10^9 limbs, least significant first.
struct Big(Vec<u32>);

impl Big {
    fn from(mut value: u64) -> Big {
        let mut limbs = Vec::new();
        while value > 0 {
            limbs.push((value % 1_000_000_000) as u32);
            value /= 1_000_000_000;
        }
        Big(limbs)
    }
    fn mul(&mut self, factor: u32) {
        let mut carry = 0u64;
        for limb in &mut self.0 {
            let product = u64::from(*limb) * u64::from(factor) + carry;
            *limb = (product % 1_000_000_000) as u32;
            carry = product / 1_000_000_000;
        }
        while carry > 0 {
            self.0.push((carry % 1_000_000_000) as u32);
            carry /= 1_000_000_000;
        }
    }
    fn digits(&self) -> String {
        let mut text = String::new();
        for (at, limb) in self.0.iter().rev().enumerate() {
            if at == 0 {
                text.push_str(&limb.to_string());
            } else {
                text.push_str(&format!("{limb:09}"));
            }
        }
        if text.is_empty() { "0".to_string() } else { text }
    }
}

/// A decimal value: sign, digits without leading or trailing zeros, and the power of ten the digits are multiplied by.
#[derive(PartialEq, Debug)]
struct Decimal {
    negative: bool,
    digits: String,
    exp: i64,
}

impl Decimal {
    fn normalized(negative: bool, digits: &str, exp: i64) -> Decimal {
        let trimmed = digits.trim_start_matches('0');
        if trimmed.is_empty() {
            return Decimal { negative: false, digits: String::new(), exp: 0 };
        }
        let stripped = trimmed.trim_end_matches('0');
        Decimal { negative, digits: stripped.to_string(), exp: exp + (trimmed.len() - stripped.len()) as i64 }
    }
}

/// `new BigDecimal(String)` for the plain forms a floating-point literal has.
fn parse(text: &str) -> Option<Decimal> {
    let (negative, rest) = match text.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, text.strip_prefix('+').unwrap_or(text)),
    };
    let (mantissa, exponent) = match rest.find(['e', 'E']) {
        Some(at) => (&rest[..at], rest[at + 1..].parse::<i64>().ok()?),
        None => (rest, 0),
    };
    let (whole, fraction) = mantissa.split_once('.').unwrap_or((mantissa, ""));
    if whole.is_empty() && fraction.is_empty() || !whole.bytes().chain(fraction.bytes()).all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    Some(Decimal::normalized(negative, &format!("{whole}{fraction}"), exponent - fraction.len() as i64))
}

/// The exact decimal value of a double, with the scale and digits `new BigDecimal(double)` gives it.
fn exact(value: f64) -> (bool, String, i64) {
    let bits = value.to_bits();
    let negative = bits >> 63 == 1;
    let exponent_bits = ((bits >> 52) & 0x7ff) as i64;
    let fraction = bits & ((1u64 << 52) - 1);
    let (mut significand, mut exponent) = if exponent_bits == 0 { (fraction, -1074) } else { (fraction | (1u64 << 52), exponent_bits - 1075) };
    if significand == 0 {
        return (false, "0".to_string(), 0);
    }
    while significand & 1 == 0 {
        significand >>= 1;
        exponent += 1;
    }
    let mut big = Big::from(significand);
    if exponent < 0 {
        for _ in 0..-exponent {
            big.mul(5);
        }
        (negative, big.digits(), -exponent)
    } else {
        for _ in 0..exponent {
            big.mul(2);
        }
        (negative, big.digits(), 0)
    }
}

/// `BigDecimal.toString` for a value with a non-negative scale.
fn to_string(negative: bool, digits: &str, scale: i64) -> String {
    let sign = if negative { "-" } else { "" };
    let adjusted = digits.len() as i64 - 1 - scale;
    if scale == 0 {
        return format!("{sign}{digits}");
    }
    if adjusted >= -6 {
        let count = digits.len() as i64;
        if count > scale {
            let (whole, fraction) = digits.split_at((count - scale) as usize);
            return format!("{sign}{whole}.{fraction}");
        }
        return format!("{sign}0.{}{digits}", "0".repeat((scale - count) as usize));
    }
    let (first, rest) = digits.split_at(1);
    let point = if rest.is_empty() { String::new() } else { format!(".{rest}") };
    format!("{sign}{first}{point}E{}{adjusted}", if adjusted >= 0 { "+" } else { "" })
}

fn floating_argument(argument: Node) -> bool {
    let inner = if argument.kind() == "unary_expression" && argument.child_by_field_name("operator").is_some() { argument.child_by_field_name("operand") } else { Some(argument) };
    inner.is_some_and(|inner| inner.kind() == "decimal_floating_point_literal")
}

pub fn big_decimal_literal_double(context: &Context, creation: Node) {
    if creation.kind() != "object_creation_expression" || class_of(context, creation).is_none_or(|class| class != "java.math.BigDecimal") {
        return;
    }
    let Some(argument) = arguments(creation).first().copied().filter(|_| arguments(creation).len() == 1) else { return };
    if crate::engine::source::children(creation).iter().any(|part| part.kind() == "class_body") || !floating_argument(argument) {
        return;
    }
    if context.resolver.resolve_constructor(creation).is_none_or(|created| created.method.parameters.iter().map(|kind| kind.name()).ne(["double".to_string()])) {
        return;
    }
    if argument.kind() == "unary_expression" && !matches!(context.text(argument.child_by_field_name("operator").unwrap_or(argument)), "-" | "+") {
        return;
    }
    let literal = match constant(context, argument) {
        Some(Const::Double(value)) => value,
        Some(Const::Float(value)) => f64::from(value),
        _ => return,
    };
    let source: String = context.text(argument).chars().filter(|character| !"_dDfF".contains(*character)).collect();
    let Some(intended) = parse(&source) else { return };
    let (negative, digits, scale) = exact(literal);
    let actual = Decimal::normalized(negative, &digits, -scale);
    if actual == intended {
        return;
    }
    let integral = if intended.digits.is_empty() {
        Some(0i128)
    } else if intended.exp >= 0 {
        let extra = intended.exp as usize;
        (intended.digits.len() + extra <= 30).then(|| format!("{}{}", intended.digits, "0".repeat(extra)).parse::<i128>().ok()).flatten().map(|value| if intended.negative { -value } else { value })
    } else {
        None
    };
    let replacement = match integral.filter(|value| i64::try_from(*value).is_ok()) {
        Some(value) => format!("{value}L"),
        None => format!("\"{source}\""),
    };
    let exact_text = to_string(negative, &digits, scale);
    let message = format!("new BigDecimal(double) loses precision in this case. The exact value here is `new BigDecimal(\"{exact_text}\")`.");
    let fix = Fix::replace(argument.start_byte(), argument.end_byte(), replacement);
    context.report_fixed("BigDecimalLiteralDouble", argument, argument.start_byte(), &message, &[fix]);
}
