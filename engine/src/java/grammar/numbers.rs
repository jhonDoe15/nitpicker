use super::code::code_bytes;
use regex::Regex;
use std::sync::LazyLock;

/// The grammar takes only single underscores between digits, and none right after the `0` of an octal literal,
/// where Java takes any run of them (`0_1__2l`). In such a number each underscore becomes a `0`, which keeps the kind
/// of literal; the rules read its value from the real text.
pub(super) fn fill_number_underscores(text: &str, bytes: &mut Option<Vec<u8>>) {
    static NUMBER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\b[0-9][0-9A-Za-z_]*").expect("pattern"));
    let mut code: Option<Vec<bool>> = None;
    for number in NUMBER.find_iter(text) {
        let written = number.as_str();
        if !written.contains("__") && !written.starts_with("0_") {
            continue;
        }
        if !code.get_or_insert_with(|| code_bytes(text))[number.start()] {
            continue;
        }
        let bytes = bytes.get_or_insert_with(|| text.as_bytes().to_vec());
        for byte in &mut bytes[number.start()..number.end()] {
            if *byte == b'_' {
                *byte = b'0';
            }
        }
    }
}

/// The grammar reads a decimal floating point literal that starts with `0` and has no `.` (`012d`, `00f`, `012e3`)
/// as an octal integer and an error. Its leading `0` becomes a `1`, which keeps the kind of literal; the rules read
/// its value from the real text.
pub(super) fn decimal_floats_after_zero(text: &str, bytes: &mut Option<Vec<u8>>) {
    static NUMBER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\b0[0-9_][0-9_]*(?:[eE][+-]?[0-9_]+)?[dDfF]?\b").expect("pattern"));
    let mut code: Option<Vec<bool>> = None;
    for number in NUMBER.find_iter(text) {
        let written = number.as_str();
        let floating = written.ends_with(['d', 'D', 'f', 'F']) || written.contains(['e', 'E']);
        let after_dot = number.start() > 0 && text.as_bytes()[number.start() - 1] == b'.';
        if !floating || after_dot || text.as_bytes().get(number.end()) == Some(&b'.') {
            continue;
        }
        if !code.get_or_insert_with(|| code_bytes(text))[number.start()] {
            continue;
        }
        bytes.get_or_insert_with(|| text.as_bytes().to_vec())[number.start()] = b'1';
    }
}
