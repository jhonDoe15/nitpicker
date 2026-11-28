//! oxc's regular expression tree turned into the matcher's terms: groups numbered in source order, flags of
//! modifier groups applied, and characters outside the Basic Multilingual Plane split into surrogate pairs
//! without `u` or `v`.
use super::{Assertion, ClassKind, Flags, Re, Set};
use oxc_regular_expression::ast::{
    BoundaryAssertionKind, CharacterClass, CharacterClassContents, CharacterClassContentsKind, CharacterClassEscapeKind,
    Disjunction, LookAroundAssertionKind, Modifier, Pattern, Term, UnicodePropertyEscape,
};
use std::collections::HashMap;

struct Compiler {
    unicode: bool,
    groups: usize,
    names: HashMap<String, Vec<usize>>,
    references: Vec<(usize, String)>,
    backs: Vec<Vec<usize>>,
}

fn units(code: u32) -> [u32; 2] {
    let offset = code - 0x10000;
    [0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff)]
}

fn escape_set(kind: CharacterClassEscapeKind) -> Set {
    match kind {
        CharacterClassEscapeKind::D => Set::Digit(false),
        CharacterClassEscapeKind::NegativeD => Set::Digit(true),
        CharacterClassEscapeKind::S => Set::Space(false),
        CharacterClassEscapeKind::NegativeS => Set::Space(true),
        CharacterClassEscapeKind::W => Set::Word(false),
        CharacterClassEscapeKind::NegativeW => Set::Word(true),
    }
}

fn property_set(property: &UnicodePropertyEscape) -> Option<Set> {
    if property.strings {
        return None;
    }
    let spec = match &property.value {
        Some(value) => format!("{}={}", property.name.as_str(), value.as_str()),
        None => property.name.as_str().to_string(),
    };
    let surrogates = ["Cs", "Surrogate", "General_Category=Cs", "gc=Cs", "General_Category=Surrogate", "gc=Surrogate"];
    let pattern = match regex::Regex::new(&format!(r"^\p{{{spec}}}$")) {
        Ok(pattern) => Some(pattern),
        Err(_) if surrogates.contains(&spec.as_str()) => None,
        Err(_) => return None,
    };
    Some(Set::Property { pattern, spec, negative: property.negative })
}

impl Compiler {
    /// A class of the `v` flag with strings matches its longest strings first, then one character, then nothing.
    fn class_term(&self, class: &CharacterClass, flags: Flags) -> Option<Re> {
        if !class.strings {
            return Some(Re::Unit(self.class(class)?, flags));
        }
        if class.negative || class.kind != CharacterClassContentsKind::Union {
            return None;
        }
        let mut strings: Vec<Vec<u32>> = Vec::new();
        let mut rest = Vec::new();
        for item in &class.body {
            match item {
                CharacterClassContents::ClassStringDisjunction(disjunction) => {
                    for string in &disjunction.body {
                        let codes: Vec<u32> = string.body.iter().map(|character| character.value).collect();
                        if codes.len() == 1 { rest.push(Set::Char(codes[0])) } else { strings.push(codes) }
                    }
                }
                CharacterClassContents::NestedCharacterClass(nested) if nested.strings => return None,
                CharacterClassContents::UnicodePropertyEscape(property) if property.strings => return None,
                _ => rest.extend(self.class_items(std::slice::from_ref(item))?),
            }
        }
        strings.sort_by_key(|codes| std::cmp::Reverse(codes.len()));
        let (empty, long): (Vec<Vec<u32>>, Vec<Vec<u32>>) = strings.into_iter().partition(Vec::is_empty);
        let mut alternatives: Vec<Re> =
            long.into_iter().map(|codes| Re::Seq(codes.into_iter().map(|code| Re::Unit(Set::Char(code), flags)).collect())).collect();
        alternatives.push(Re::Unit(Set::Class { negative: false, kind: ClassKind::Union, items: rest }, flags));
        if !empty.is_empty() {
            alternatives.push(Re::Seq(Vec::new()));
        }
        Some(Re::Alt(alternatives))
    }

    fn class(&self, class: &CharacterClass) -> Option<Set> {
        if class.strings {
            return None;
        }
        let kind = match class.kind {
            CharacterClassContentsKind::Union => ClassKind::Union,
            CharacterClassContentsKind::Intersection => ClassKind::Intersection,
            CharacterClassContentsKind::Subtraction => ClassKind::Subtraction,
        };
        let items = self.class_items(&class.body)?;
        Some(Set::Class { negative: class.negative, kind, items })
    }

    fn class_items(&self, contents: &[CharacterClassContents]) -> Option<Vec<Set>> {
        let mut items = Vec::new();
        for item in contents {
            match item {
                CharacterClassContents::CharacterClassRange(range) => {
                    let (low, high) = (range.min.value, range.max.value);
                    if !self.unicode && high > 0xffff {
                        return None;
                    }
                    items.push(Set::Range(low, high));
                }
                CharacterClassContents::CharacterClassEscape(escape) => items.push(escape_set(escape.kind)),
                CharacterClassContents::UnicodePropertyEscape(property) => items.push(property_set(property)?),
                CharacterClassContents::Character(character) if !self.unicode && character.value > 0xffff => {
                    items.extend(units(character.value).map(Set::Char));
                }
                CharacterClassContents::Character(character) => items.push(Set::Char(character.value)),
                CharacterClassContents::NestedCharacterClass(nested) => items.push(self.class(nested)?),
                CharacterClassContents::ClassStringDisjunction(disjunction) => {
                    for string in &disjunction.body {
                        let [character] = string.body.as_slice() else { return None };
                        items.push(Set::Char(character.value));
                    }
                }
            }
        }
        Some(items)
    }

    fn character(&self, code: u32, flags: Flags) -> Re {
        if self.unicode || code <= 0xffff {
            return Re::Unit(Set::Char(code), flags);
        }
        Re::Seq(units(code).map(|unit| Re::Unit(Set::Char(unit), flags)).into_iter().collect())
    }

    fn term(&mut self, term: &Term, flags: Flags) -> Option<Re> {
        Some(match term {
            Term::BoundaryAssertion(assertion) => {
                let kind = match assertion.kind {
                    BoundaryAssertionKind::Start => Assertion::Start,
                    BoundaryAssertionKind::End => Assertion::End,
                    BoundaryAssertionKind::Boundary => Assertion::Boundary,
                    BoundaryAssertionKind::NegativeBoundary => Assertion::NotBoundary,
                    _ => return None,
                };
                Re::Assert(kind, flags)
            }
            Term::LookAroundAssertion(look) => {
                let (behind, negative) = match look.kind {
                    LookAroundAssertionKind::Lookahead => (false, false),
                    LookAroundAssertionKind::NegativeLookahead => (false, true),
                    LookAroundAssertionKind::Lookbehind => (true, false),
                    LookAroundAssertionKind::NegativeLookbehind => (true, true),
                };
                Re::Look { behind, negative, body: Box::new(self.disjunction(&look.body, flags)?) }
            }
            Term::Quantifier(quantifier) => return self.quantifier(quantifier, flags),
            Term::Character(character) => self.character(character.value, flags),
            Term::Dot(_) => Re::Unit(Set::Dot, flags),
            Term::CharacterClassEscape(escape) => Re::Unit(escape_set(escape.kind), flags),
            Term::UnicodePropertyEscape(property) => Re::Unit(property_set(property)?, flags),
            Term::CharacterClass(class) => self.class_term(class, flags)?,
            Term::CapturingGroup(group) => {
                self.groups += 1;
                let index = self.groups;
                if let Some(name) = &group.name {
                    self.names.entry(name.as_str().to_string()).or_default().push(index);
                }
                Re::Group(index, Box::new(self.disjunction(&group.body, flags)?))
            }
            Term::IgnoreGroup(group) => {
                let mut inner = flags;
                if let Some(modifiers) = &group.modifiers {
                    for (bit, on) in [(&modifiers.enabling, true), (&modifiers.disabling, false)] {
                        inner.ignore_case = if bit.contains(Modifier::I) { on } else { inner.ignore_case };
                        inner.multiline = if bit.contains(Modifier::M) { on } else { inner.multiline };
                        inner.dot_all = if bit.contains(Modifier::S) { on } else { inner.dot_all };
                    }
                }
                self.disjunction(&group.body, inner)?
            }
            Term::IndexedReference(reference) => {
                self.backs.push(vec![reference.index as usize]);
                Re::Back(vec![reference.index as usize], flags)
            }
            Term::NamedReference(reference) => {
                self.references.push((self.backs.len(), reference.name.as_str().to_string()));
                self.backs.push(Vec::new());
                Re::Back(Vec::new(), flags)
            }
        })
    }

    fn quantifier(&mut self, quantifier: &oxc_regular_expression::ast::Quantifier, flags: Flags) -> Option<Re> {
        let before = self.groups;
        let split = match &quantifier.body {
            Term::Character(character) if !self.unicode && character.value > 0xffff => Some(units(character.value)),
            _ => None,
        };
        let body = match split {
            Some([_, low]) => Re::Unit(Set::Char(low), flags),
            None => self.term(&quantifier.body, flags)?,
        };
        let repeat = Re::Repeat {
            min: quantifier.min,
            max: quantifier.max,
            greedy: quantifier.greedy,
            body: Box::new(body),
            groups: (before + 1, self.groups + 1),
        };
        Some(match split {
            Some([high, _]) => Re::Seq(vec![Re::Unit(Set::Char(high), flags), repeat]),
            None => repeat,
        })
    }

    fn disjunction(&mut self, disjunction: &Disjunction, flags: Flags) -> Option<Re> {
        let mut alternatives = Vec::new();
        for alternative in &disjunction.body {
            let mut terms = Vec::new();
            for term in &alternative.body {
                terms.push(self.term(term, flags)?);
            }
            alternatives.push(Re::Seq(terms));
        }
        Some(if alternatives.len() == 1 { alternatives.pop()? } else { Re::Alt(alternatives) })
    }
}

fn resolve(re: &mut Re, backs: &mut std::slice::IterMut<Vec<usize>>) {
    match re {
        Re::Seq(items) | Re::Alt(items) => items.iter_mut().for_each(|item| resolve(item, backs)),
        Re::Look { body, .. } | Re::Group(_, body) | Re::Repeat { body, .. } => resolve(body, backs),
        Re::Back(indices, _) => {
            if let Some(resolved) = backs.next() {
                *indices = resolved.clone();
            }
        }
        Re::Unit(..) | Re::Assert(..) => {}
    }
}

/// The matcher's terms for a parsed pattern, and how many groups capture.
pub fn pattern(parsed: &Pattern, flags: Flags, unicode: bool) -> Option<(Re, usize)> {
    let mut compiler = Compiler { unicode, groups: 0, names: HashMap::new(), references: Vec::new(), backs: Vec::new() };
    let mut root = compiler.disjunction(&parsed.body, flags)?;
    for (slot, name) in std::mem::take(&mut compiler.references) {
        compiler.backs[slot] = compiler.names.get(&name).cloned()?;
    }
    let mut backs = std::mem::take(&mut compiler.backs);
    resolve(&mut root, &mut backs.iter_mut());
    Some((root, compiler.groups))
}
