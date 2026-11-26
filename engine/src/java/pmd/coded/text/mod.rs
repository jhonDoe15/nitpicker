//! Ports of PMD rules written in Java about string literals and log messages.
mod literals;

use super::Port;

pub fn port(class: &str) -> Option<Port> {
    Some(match class {
        "AvoidDuplicateLiteralsRule" => literals::avoid_duplicate_literals,
        _ => return None,
    })
}

/// A whole number as `java.text.MessageFormat` writes it, with grouping separators.
pub fn grouped(number: usize) -> String {
    let digits = number.to_string();
    let mut out = String::new();
    for (at, digit) in digits.chars().enumerate() {
        if at > 0 && (digits.len() - at) % 3 == 0 {
            out.push(',');
        }
        out.push(digit);
    }
    out
}
