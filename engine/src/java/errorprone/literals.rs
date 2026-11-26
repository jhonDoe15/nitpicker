//! FloatingPointLiteralPrecision: a `float` or `double` literal that cannot hold the digits written.
use super::Context;
use super::fixes::Fix;
use tree_sitter::Node;

const MESSAGE: &str = "Floating point literal loses precision";

/// A decimal number as digits and a power of ten: the value is `digits * 10^exponent`, digits without trailing zeros.
#[derive(PartialEq, Eq)]
struct Decimal {
    digits: String,
    exponent: i64,
}

/// Parses what `BigDecimal(String)` accepts: digits with an optional point and an optional exponent.
fn parse(text: &str) -> Option<(String, i64)> {
    let (mantissa, exponent) = match text.find(['e', 'E']) {
        Some(at) => (&text[..at], text[at + 1..].parse::<i64>().ok()?),
        None => (text, 0),
    };
    let (whole, fraction) = mantissa.split_once('.').unwrap_or((mantissa, ""));
    if (whole.is_empty() && fraction.is_empty()) || !whole.bytes().chain(fraction.bytes()).all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    Some((format!("{whole}{fraction}"), exponent - fraction.len() as i64))
}

fn normal((digits, exponent): (String, i64)) -> Decimal {
    let trimmed = digits.trim_start_matches('0');
    let kept = trimmed.trim_end_matches('0');
    if kept.is_empty() {
        return Decimal { digits: String::new(), exponent: 0 };
    }
    Decimal { digits: kept.to_string(), exponent: exponent + (trimmed.len() - kept.len()) as i64 }
}

/// `Double.toString` or `Float.toString` of a value, from the shortest digits that identify it.
fn java_string(scientific: &str) -> String {
    let (mantissa, exponent) = scientific.split_once('e').unwrap_or((scientific, "0"));
    let exponent: i32 = exponent.parse().unwrap_or(0);
    let digits: String = mantissa.chars().filter(char::is_ascii_digit).collect();
    if digits.bytes().all(|byte| byte == b'0') {
        return "0.0".to_string();
    }
    if (-3..7).contains(&exponent) {
        if exponent >= 0 {
            let at = exponent as usize + 1;
            let padded = format!("{digits:0<at$}");
            let (whole, fraction) = padded.split_at(at);
            return format!("{whole}.{}", if fraction.is_empty() { "0" } else { fraction });
        }
        return format!("0.{}{digits}", "0".repeat((-exponent - 1) as usize));
    }
    let (first, rest) = digits.split_at(1);
    format!("{first}.{}E{exponent}", if rest.is_empty() { "0" } else { rest })
}

/// `BigDecimal.toString` of the number `Double.toString` wrote.
fn big_decimal_string(java: &str) -> String {
    let Some((digits, exponent)) = parse(java) else { return java.to_string() };
    let scale = -exponent;
    let unscaled = digits.trim_start_matches('0');
    let unscaled = if unscaled.is_empty() { "0" } else { unscaled };
    if scale == 0 {
        return unscaled.to_string();
    }
    let adjusted = unscaled.len() as i64 - 1 - scale;
    if scale > 0 && adjusted >= -6 {
        let pad = scale as usize;
        if unscaled.len() > pad {
            let (whole, fraction) = unscaled.split_at(unscaled.len() - pad);
            return format!("{whole}.{fraction}");
        }
        return format!("0.{}{unscaled}", "0".repeat(pad - unscaled.len()));
    }
    let mut out = unscaled[..1].to_string();
    if unscaled.len() > 1 {
        out.push('.');
        out.push_str(&unscaled[1..]);
    }
    if adjusted != 0 {
        out.push_str(&format!("E{}{adjusted}", if adjusted > 0 { "+" } else { "" }));
    }
    out
}

pub fn floating_point_literal_precision(context: &Context, node: Node) {
    if node.kind() != "decimal_floating_point_literal" {
        return;
    }
    let source = context.text(node);
    let float = source.ends_with(['f', 'F']);
    let trimmed = source.strip_suffix(['f', 'F', 'd', 'D']).unwrap_or(source).replace('_', "");
    let Some(exact) = parse(&trimmed) else { return };
    let scientific = if float {
        let Ok(value) = trimmed.parse::<f32>() else { return };
        format!("{value:e}")
    } else {
        let Ok(value) = trimmed.parse::<f64>() else { return };
        format!("{value:e}")
    };
    let java = java_string(&scientific);
    let Some(value) = parse(&java) else { return };
    if normal(parse(&trimmed).unwrap_or(exact)) == normal(value) {
        return;
    }
    let replacement = format!("{}{}", big_decimal_string(&java), if float { "f" } else { "" });
    let fixes = if replacement.chars().count() > 3 * trimmed.chars().count() { Vec::new() } else { vec![Fix::replace(node.start_byte(), node.end_byte(), replacement)] };
    context.report_fixed("FloatingPointLiteralPrecision", node, node.start_byte(), MESSAGE, &fixes);
}
