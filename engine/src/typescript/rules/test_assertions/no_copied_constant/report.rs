//! The text of a finding and the JavaScript spellings of the values it shows.
use super::graph::Entry;
use super::module::Value;
use std::cmp::Ordering;

const MINIMUM_STRING_LENGTH: usize = 3;
const TRIVIAL_NUMBERS: [f64; 4] = [-1.0, 0.0, 1.0, 2.0];

/// `\s` of a JavaScript regular expression.
fn is_blank_char(character: char) -> bool {
    matches!(character, '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}')
        || matches!(character, '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

pub fn is_trivial(value: &Value) -> bool {
    match value {
        Value::Number(number) => !number.is_finite() || TRIVIAL_NUMBERS.contains(number),
        Value::Text(text) => text.encode_utf16().count() < MINIMUM_STRING_LENGTH || text.chars().all(is_blank_char),
    }
}

/// `String(number)`.
pub fn js_number(number: f64) -> String {
    if number.is_nan() {
        return "NaN".into();
    }
    if number == 0.0 {
        return "0".into();
    }
    if number.is_infinite() {
        return if number < 0.0 { "-Infinity" } else { "Infinity" }.into();
    }
    let sign = if number < 0.0 { "-" } else { "" };
    let scientific = format!("{:e}", number.abs());
    let (mantissa, exponent) = scientific.split_once('e').unwrap_or((&scientific, "0"));
    let digits: String = mantissa.chars().filter(|character| *character != '.').collect();
    let point = exponent.parse::<i32>().unwrap_or(0) + 1;
    let count = digits.len() as i32;
    let body = if count <= point && point <= 21 {
        format!("{digits}{}", "0".repeat((point - count) as usize))
    } else if 0 < point && point <= 21 {
        format!("{}.{}", &digits[..point as usize], &digits[point as usize..])
    } else if -6 < point && point <= 0 {
        format!("0.{}{digits}", "0".repeat((-point) as usize))
    } else {
        let power = point - 1;
        let exponent = format!("e{}{}", if power < 0 { '-' } else { '+' }, power.abs());
        if count == 1 { format!("{digits}{exponent}") } else { format!("{}.{}{exponent}", &digits[..1], &digits[1..]) }
    };
    format!("{sign}{body}")
}

/// `JSON.stringify` of a string.
pub fn json_string(text: &str) -> String {
    let mut quoted = String::with_capacity(text.len() + 2);
    quoted.push('"');
    for character in text.chars() {
        match character {
            '"' => quoted.push_str("\\\""),
            '\\' => quoted.push_str("\\\\"),
            '\u{8}' => quoted.push_str("\\b"),
            '\u{c}' => quoted.push_str("\\f"),
            '\n' => quoted.push_str("\\n"),
            '\r' => quoted.push_str("\\r"),
            '\t' => quoted.push_str("\\t"),
            control if (control as u32) < 0x20 => quoted.push_str(&format!("\\u{:04x}", control as u32)),
            other => quoted.push(other),
        }
    }
    quoted.push('"');
    quoted
}

/// `byText`: JavaScript's order of strings, by UTF-16 code unit.
fn by_text(left: &str, right: &str) -> Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}

fn sorted_unique<'e>(names: impl Iterator<Item = &'e str>) -> Vec<&'e str> {
    let mut names: Vec<&str> = names.collect();
    names.sort_by(|left, right| by_text(left, right));
    names.dedup();
    names
}

/// The message of the rule for one literal and the constants that hold its value.
pub fn message(value: &Value, entries: &[Entry]) -> String {
    let names = sorted_unique(entries.iter().map(|entry| entry.name.as_str()));
    let owners = sorted_unique(entries.iter().map(|entry| entry.owner.as_str())).join(" and ");
    let name = names[0];
    let also = match names.len() {
        1 => String::new(),
        _ => format!(" (and {}, which hold the same value)", names[1..].join(", ")),
    };
    let shown = match value {
        Value::Number(number) => js_number(*number),
        Value::Text(text) => json_string(text),
    };
    let advice = match value {
        Value::Number(_) => format!("Use {name} (or an expression on it, such as {name} + 1)."),
        Value::Text(_) => format!("Use {name} (or build the text from it)."),
    };
    format!(
        "This literal copies {name}{also} from {owners}: when {name} changes, the test keeps checking the old value or \
         stops testing the case it was written for. {advice} If the value is a contract the test pins on purpose, \
         assert it next to the constant: expect({name}).toBe({shown})."
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_numbers_as_javascript_does() {
        assert_eq!(js_number(50.0), "50");
        assert_eq!(js_number(-25.0), "-25");
        assert_eq!(js_number(0.5), "0.5");
        assert_eq!(js_number(1e21), "1e+21");
        assert_eq!(js_number(123456789012345680000.0), "123456789012345680000");
        assert_eq!(js_number(0.000001), "0.000001");
        assert_eq!(js_number(0.0000001), "1e-7");
        assert_eq!(js_number(1.5e300), "1.5e+300");
    }

    #[test]
    fn quotes_text_as_json_does() {
        assert_eq!(json_string("a\"b\n\u{1}"), "\"a\\\"b\\n\\u0001\"");
    }
}
