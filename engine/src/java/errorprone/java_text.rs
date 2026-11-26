//! Text the way Java prints it: `Double.toString`, `Float.toString` and Error Prone's `javaCharEscaper`.

/// Digits and decimal exponent of a shortest round-trip rendering in scientific form, such as `1.234e-5`.
fn shortest(scientific: &str) -> (String, i32) {
    let (mantissa, exponent) = scientific.split_once('e').unwrap_or((scientific, "0"));
    (mantissa.replace('.', ""), exponent.parse().unwrap_or(0))
}

/// Lays out digits `d1 d2 ...` of the value `0.d1d2... * 10^(exponent + 1)` like `Double.toString`.
fn layout(negative: bool, digits: &str, exponent: i32) -> String {
    let sign = if negative { "-" } else { "" };
    if (-3..7).contains(&exponent) {
        if exponent >= 0 {
            let point = exponent as usize + 1;
            let (whole, rest) = if digits.len() > point { digits.split_at(point) } else { (digits, "") };
            let whole = format!("{whole}{}", "0".repeat(point.saturating_sub(whole.len())));
            return format!("{sign}{whole}.{}", if rest.is_empty() { "0" } else { rest });
        }
        return format!("{sign}0.{}{digits}", "0".repeat((-exponent - 1) as usize));
    }
    let (first, rest) = digits.split_at(1);
    format!("{sign}{first}.{}E{exponent}", if rest.is_empty() { "0" } else { rest })
}

pub fn double_to_string(value: f64) -> String {
    if value.is_nan() {
        return "NaN".to_string();
    }
    if value.is_infinite() {
        return if value > 0.0 { "Infinity" } else { "-Infinity" }.to_string();
    }
    if value == 0.0 {
        return if value.is_sign_negative() { "-0.0" } else { "0.0" }.to_string();
    }
    let (digits, exponent) = shortest(&format!("{:e}", value.abs()));
    layout(value < 0.0, &digits, exponent)
}

pub fn float_to_string(value: f32) -> String {
    if value.is_nan() {
        return "NaN".to_string();
    }
    if value.is_infinite() {
        return if value > 0.0 { "Infinity" } else { "-Infinity" }.to_string();
    }
    if value == 0.0 {
        return if value.is_sign_negative() { "-0.0" } else { "0.0" }.to_string();
    }
    let (digits, exponent) = shortest(&format!("{:e}", value.abs()));
    layout(value < 0.0, &digits, exponent)
}

/// `SourceCodeEscapers.javaCharEscaper().escape(text)`.
pub fn escape_java_chars(text: &str) -> String {
    let mut out = String::new();
    for unit in text.encode_utf16() {
        match unit {
            0x08 => out.push_str("\\b"),
            0x0c => out.push_str("\\f"),
            0x0a => out.push_str("\\n"),
            0x0d => out.push_str("\\r"),
            0x09 => out.push_str("\\t"),
            0x22 => out.push_str("\\\""),
            0x5c => out.push_str("\\\\"),
            0x27 => out.push_str("\\'"),
            0x20..=0x7e => out.push(char::from(unit as u8)),
            _ => out.push_str(&format!("\\u{unit:04x}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prints_doubles_like_java() {
        assert_eq!(double_to_string(1.0), "1.0");
        assert_eq!(double_to_string(100.0), "100.0");
        assert_eq!(double_to_string(1234567.0), "1234567.0");
        assert_eq!(double_to_string(12345678.0), "1.2345678E7");
        assert_eq!(double_to_string(0.001), "0.001");
        assert_eq!(double_to_string(0.0001), "1.0E-4");
        assert_eq!(double_to_string(-2.5), "-2.5");
        assert_eq!(double_to_string(1e23), "1.0E23");
        assert_eq!(float_to_string(1.5), "1.5");
        assert_eq!(float_to_string(3.0e10), "3.0E10");
    }

    #[test]
    fn escapes_like_the_error_prone_escaper() {
        assert_eq!(escape_java_chars("a\tb\"'é"), "a\\tb\\\"\\'\\u00e9");
    }
}
