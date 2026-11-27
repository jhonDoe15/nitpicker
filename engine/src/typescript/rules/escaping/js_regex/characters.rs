//! The character sets and case folding of JavaScript regular expressions: `\d`, `\s`, `\w`, line terminators, and
//! the `Canonicalize` of the specification, with and without the `u` or `v` flag.

use std::collections::HashMap;
use std::sync::LazyLock;

/// Simple case foldings that upper then lower case do not reach.
const FOLDINGS: [(u32, u32); 3] = [(0x1fd3, 0x390), (0x1fe3, 0x3b0), (0xfb05, 0xfb06)];

/// For each canonical character, the other characters with the same canonical form.
type Orbits = HashMap<u32, Vec<u32>>;

fn orbits(unicode: bool) -> Orbits {
    let mut found: Orbits = HashMap::new();
    for code in 0..=0x10ffff {
        let key = canonical(code, unicode);
        if key != code {
            found.entry(key).or_default().push(code);
        }
    }
    found
}

static UNICODE_ORBITS: LazyLock<Orbits> = LazyLock::new(|| orbits(true));
static CODE_UNIT_ORBITS: LazyLock<Orbits> = LazyLock::new(|| orbits(false));

fn single(mut mapped: impl Iterator<Item = char>) -> Option<char> {
    let first = mapped.next()?;
    if mapped.next().is_none() { Some(first) } else { None }
}

fn upper(code: u32) -> u32 {
    char::from_u32(code).and_then(|character| single(character.to_uppercase())).map_or(code, u32::from)
}

fn lower(code: u32) -> u32 {
    char::from_u32(code).and_then(|character| single(character.to_lowercase())).map_or(code, u32::from)
}

/// `Canonicalize(rer, ch)`: simple case folding with `u` or `v`, upper case without.
pub fn canonical(code: u32, unicode: bool) -> u32 {
    if unicode {
        if let Some((_, folded)) = FOLDINGS.iter().find(|(from, _)| *from == code) {
            return *folded;
        }
        return if code == 0x130 || code == 0x131 { code } else { lower(upper(code)) };
    }
    let Some(character) = char::from_u32(code) else { return code };
    let Some(cased) = single(character.to_uppercase()).map(u32::from) else { return code };
    if cased > 0xffff || (code >= 128 && cased < 128) { code } else { cased }
}

/// Every character canonically equal to a character, itself included.
pub fn variants(code: u32, unicode: bool) -> Vec<u32> {
    let key = canonical(code, unicode);
    let orbits = if unicode { &*UNICODE_ORBITS } else { &*CODE_UNIT_ORBITS };
    let mut found = vec![key];
    found.extend(orbits.get(&key).into_iter().flatten().copied());
    found
}

pub fn is_digit(code: u32) -> bool {
    (0x30..=0x39).contains(&code)
}

/// `\s`: white space and line terminators.
pub fn is_space(code: u32) -> bool {
    matches!(code, 0x09..=0x0d | 0x20 | 0xa0 | 0x1680 | 0x2000..=0x200a | 0x2028 | 0x2029 | 0x202f | 0x205f | 0x3000 | 0xfeff)
}

/// `\w`, with the two characters that fold into it when both `u` and `i` are set.
pub fn is_word(code: u32, unicode_ignore_case: bool) -> bool {
    let basic = matches!(code, 0x30..=0x39 | 0x41..=0x5a | 0x61..=0x7a | 0x5f);
    basic || (unicode_ignore_case && (code == 0x17f || code == 0x212a))
}

pub fn is_line_terminator(code: u32) -> bool {
    matches!(code, 0x0a | 0x0d | 0x2028 | 0x2029)
}
