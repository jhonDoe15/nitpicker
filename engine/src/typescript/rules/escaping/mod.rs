//! The rules of the ESLint plugin's `escaping/` folder: `replace` chains that escape or unescape text.
mod chains;
pub mod incomplete;
mod js_regex;

/// `\w` as JavaScript reads it with both `u` and `i`, which `\b` follows too.
pub fn is_js_word(code: u32) -> bool {
    js_regex::is_word(code)
}

/// Whether `new RegExp(pattern, flags)` builds: the parser typescript-estree uses gives a literal Node cannot build
/// the value `null`.
pub fn is_valid_regex(pattern: &str, flags: &str) -> bool {
    js_regex::is_valid(pattern, flags)
}
