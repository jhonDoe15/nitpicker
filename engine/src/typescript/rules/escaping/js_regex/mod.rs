//! JavaScript's `RegExp.prototype.test` for the patterns of `replace` calls: the pattern is parsed by oxc's regular
//! expression parser and matched by backtracking, over UTF-16 code units, or code points with `u` or `v`, as the
//! specification matches. A pattern this matcher does not cover, or a match that runs too long, answers `None`.
mod characters;
mod compile;
mod matcher;
mod sets;
#[cfg(test)]
mod tests;

use oxc_allocator::Allocator;
use oxc_regular_expression::{LiteralParser, Options};

#[derive(Clone, Copy, Default)]
pub struct Flags {
    pub ignore_case: bool,
    pub multiline: bool,
    pub dot_all: bool,
}

pub enum Set {
    Char(u32),
    Range(u32, u32),
    Digit(bool),
    Space(bool),
    Word(bool),
    Dot,
    Property { pattern: Option<regex::Regex>, spec: String, negative: bool },
    Class { negative: bool, kind: ClassKind, items: Vec<Set> },
}

#[derive(Clone, Copy, PartialEq)]
pub enum ClassKind {
    Union,
    Intersection,
    Subtraction,
}

#[derive(Clone, Copy, PartialEq)]
pub enum Assertion {
    Start,
    End,
    Boundary,
    NotBoundary,
}

pub enum Re {
    Seq(Vec<Re>),
    Alt(Vec<Re>),
    Unit(Set, Flags),
    Assert(Assertion, Flags),
    Look { behind: bool, negative: bool, body: Box<Re> },
    Group(usize, Box<Re>),
    Repeat { min: u64, max: Option<u64>, greedy: bool, body: Box<Re>, groups: (usize, usize) },
    Back(Vec<usize>, Flags),
}

pub struct JsRegex {
    root: Re,
    groups: usize,
    unicode: bool,
    unicode_sets: bool,
}

impl JsRegex {
    /// `new RegExp(pattern, flags)`, `None` when the pattern is not one this matcher covers.
    pub fn new(pattern: &str, flags: &str) -> Option<JsRegex> {
        let allocator = Allocator::default();
        let parsed = LiteralParser::new(&allocator, pattern, Some(flags), Options::default()).parse().ok()?;
        let unicode = flags.contains('u') || flags.contains('v');
        let base = Flags { ignore_case: flags.contains('i'), multiline: flags.contains('m'), dot_all: flags.contains('s') };
        let (root, groups) = compile::pattern(&parsed, base, unicode)?;
        Some(JsRegex { root, groups, unicode, unicode_sets: flags.contains('v') })
    }

    /// `regex.test(text)` for a text given as UTF-16 code units, `None` when the match ran too long.
    pub fn test(&self, units: &[u16]) -> Option<bool> {
        let input: Vec<u32> = if self.unicode {
            char::decode_utf16(units.iter().copied()).map(|decoded| decoded.map_or_else(|lone| u32::from(lone.unpaired_surrogate()), u32::from)).collect()
        } else {
            units.iter().map(|unit| u32::from(*unit)).collect()
        };
        matcher::test(&self.root, self.groups, sets::Sets { unicode: self.unicode, unicode_sets: self.unicode_sets }, &input)
    }
}

/// `\w` with both `u` and `i`.
pub fn is_word(code: u32) -> bool {
    characters::is_word(code, true)
}

/// Whether the pattern and flags parse as a regular expression.
pub fn is_valid(pattern: &str, flags: &str) -> bool {
    let allocator = Allocator::default();
    LiteralParser::new(&allocator, pattern, Some(flags), Options::default()).parse().is_ok()
}
