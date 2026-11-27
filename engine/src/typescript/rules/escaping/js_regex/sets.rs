//! Whether a character is in a set: plainly, under `i` with `u` or without (some canonically equal member), and
//! under `i` with `v`, where sets are folded before a complement is taken.
use super::characters::{is_digit, is_line_terminator, is_space, is_word, variants};
use super::{ClassKind, Flags, Set};

/// The properties a lone surrogate has, which the `regex` crate cannot be asked about.
const SURROGATE_PROPERTIES: [&str; 22] = [
    "Cs", "Surrogate", "C", "Other", "Any", "Assigned", "General_Category=Cs", "gc=Cs", "General_Category=Surrogate",
    "gc=Surrogate", "General_Category=C", "gc=C", "General_Category=Other", "gc=Other", "Script=Zzzz", "sc=Zzzz",
    "Script=Unknown", "sc=Unknown", "Script_Extensions=Zzzz", "scx=Zzzz", "Script_Extensions=Unknown", "scx=Unknown",
];

pub struct Sets {
    pub unicode: bool,
    pub unicode_sets: bool,
}

fn property(pattern: Option<&regex::Regex>, spec: &str, code: u32) -> bool {
    match char::from_u32(code) {
        Some(character) => pattern.is_some_and(|pattern| pattern.is_match(character.encode_utf8(&mut [0; 4]))),
        None => SURROGATE_PROPERTIES.contains(&spec),
    }
}

impl Sets {
    /// The positive set of an escape or property, and whether the term takes its complement.
    fn base(&self, set: &Set, code: u32, flags: Flags) -> (bool, bool) {
        let unicode_case = self.unicode && flags.ignore_case;
        match set {
            Set::Char(character) => (*character == code, false),
            Set::Range(low, high) => ((*low..=*high).contains(&code), false),
            Set::Digit(negative) => (is_digit(code), *negative),
            Set::Space(negative) => (is_space(code), *negative),
            Set::Word(negative) => (is_word(code, unicode_case), *negative),
            Set::Dot => (flags.dot_all || !is_line_terminator(code), false),
            Set::Property { pattern, spec, negative } => (property(pattern.as_ref(), spec, code), *negative),
            Set::Class { .. } => (false, false),
        }
    }

    fn class(&self, kind: ClassKind, items: &[Set], code: u32, flags: Flags) -> bool {
        let inside = |item: &Set| self.matches(item, code, flags);
        match kind {
            ClassKind::Union => items.iter().any(inside),
            ClassKind::Intersection => items.iter().all(inside),
            ClassKind::Subtraction => items.first().is_some_and(inside) && !items[1..].iter().any(inside),
        }
    }

    pub fn matches(&self, set: &Set, code: u32, flags: Flags) -> bool {
        if let Set::Class { negative, kind, items } = set {
            return self.class(*kind, items, code, flags) != *negative;
        }
        if !flags.ignore_case || matches!(set, Set::Dot) {
            let (found, complement) = self.base(set, code, flags);
            return found != complement;
        }
        let candidates = variants(code, self.unicode);
        if self.unicode_sets {
            let (_, complement) = self.base(set, code, flags);
            let found = candidates.iter().any(|variant| self.base(set, *variant, flags).0);
            return found != complement;
        }
        candidates.iter().any(|variant| {
            let (found, complement) = self.base(set, *variant, flags);
            found != complement
        })
    }
}
