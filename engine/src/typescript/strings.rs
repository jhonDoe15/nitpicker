//! JavaScript string values as the compiler computes them, held in Rust strings.
//!
//! A JavaScript string is a sequence of UTF-16 code units and may hold half of a surrogate pair on its own
//! (`"\uD800"`, or a text cut between the two halves). Rust strings cannot, so a lone half is kept as a
//! private-use character from a window of 2,048 code points that the file's own text does not use, and is
//! turned back into what Node writes at the two places a value leaves the engine: JSON text and hashes.
use oxc_ast::ast::TemplateElement;
use oxc_str::JSStr;
use std::borrow::Cow;

const WINDOW: u32 = 0x800;
const WINDOWS: u32 = 32;
const PRIVATE_PLANE: u32 = 0x10_0000;
const PRIVATE_PLANE_LEAD: u8 = 0xF4;
const FIRST_SURROGATE: u32 = 0xD800;
const FIRST_LOW_SURROGATE: u32 = 0xDC00;
const ASTRAL: u32 = 0x1_0000;

/// Where lone surrogate halves of one file are kept.
#[derive(Clone, Copy, Debug)]
pub struct Halves {
    base: u32,
}

impl Halves {
    pub fn of(source: &str) -> Halves {
        if !source.as_bytes().contains(&PRIVATE_PLANE_LEAD) {
            return Halves { base: PRIVATE_PLANE };
        }
        let mut used = [false; WINDOWS as usize];
        for character in source.chars().map(u32::from).filter(|code| *code >= PRIVATE_PLANE) {
            used[((character - PRIVATE_PLANE) / WINDOW) as usize] = true;
        }
        let free = used.iter().position(|taken| !taken).unwrap_or(0) as u32;
        Halves { base: PRIVATE_PLANE + free * WINDOW }
    }

    fn kept(self, unit: u32) -> char {
        char::from_u32(self.base + unit - FIRST_SURROGATE).expect("private use")
    }

    fn half(self, character: char) -> Option<u32> {
        let code = u32::from(character);
        (code >= self.base && code < self.base + WINDOW).then(|| code - self.base + FIRST_SURROGATE)
    }

    fn any(self, text: &str) -> bool {
        text.as_bytes().contains(&PRIVATE_PLANE_LEAD) && text.chars().any(|character| self.half(character).is_some())
    }

    /// The first half of an astral character, for a text cut in its middle.
    pub fn first_half(self, character: char) -> char {
        self.kept(FIRST_SURROGATE + ((u32::from(character) - ASTRAL) >> 10))
    }

    pub fn from_units(self, units: impl Iterator<Item = u16>) -> String {
        char::decode_utf16(units).map(|unit| unit.unwrap_or_else(|lone| self.kept(u32::from(lone.unpaired_surrogate())))).collect()
    }

    pub fn string(self, value: JSStr) -> String {
        self.from_units(value.encode_utf16())
    }

    /// The text the compiler gives a template part. A tagged template may hold escapes that are not valid;
    /// the compiler then keeps those escapes as written and still reads the valid ones.
    pub fn template(self, element: &TemplateElement) -> String {
        match element.value.cooked {
            Some(cooked) => self.string(cooked),
            None => self.from_units(TemplateText::of(element.value.raw.as_str()).read().into_iter()),
        }
    }

    /// `JSON.stringify` of a string: a lone half is written as a `\udXXX` escape.
    pub fn quoted(self, text: &str) -> String {
        self.json(serde_json::to_string(text).expect("string"))
    }

    /// Serialized JSON with every kept half written the way Node writes it.
    pub fn json(self, serialized: String) -> String {
        if !self.any(&serialized) {
            return serialized;
        }
        let mut out = String::with_capacity(serialized.len() + 8);
        for character in serialized.chars() {
            match self.half(character) {
                Some(unit) => out.push_str(&format!("\\u{unit:04x}")),
                None => out.push(character),
            }
        }
        out
    }

    /// The text as Node encodes it to UTF-8: a lone half becomes U+FFFD.
    pub fn encoded(self, text: &str) -> Cow<'_, str> {
        if !self.any(text) {
            return Cow::Borrowed(text);
        }
        Cow::Owned(text.chars().map(|character| if self.half(character).is_some() { '\u{fffd}' } else { character }).collect())
    }

    /// Length in UTF-16 code units.
    pub fn units(self, character: char) -> usize {
        if self.half(character).is_some() { 1 } else { character.len_utf16() }
    }
}

/// The compiler's reading of the source text of a template part, in UTF-16 code units.
struct TemplateText {
    units: Vec<u16>,
    at: usize,
    out: Vec<u16>,
}

const BACKSLASH: u16 = 0x5c;
const CARRIAGE_RETURN: u16 = 0x0d;
const LINE_FEED: u16 = 0x0a;

fn digit(unit: Option<u16>, radix: u32) -> Option<u32> {
    unit.and_then(|unit| char::from_u32(u32::from(unit))).and_then(|character| character.to_digit(radix))
}

impl TemplateText {
    fn of(raw: &str) -> TemplateText {
        TemplateText { units: raw.encode_utf16().collect(), at: 0, out: Vec::new() }
    }

    fn peek(&self) -> Option<u16> {
        self.units.get(self.at).copied()
    }

    fn read(mut self) -> Vec<u16> {
        while let Some(unit) = self.peek() {
            match unit {
                BACKSLASH => self.escape(),
                CARRIAGE_RETURN => {
                    self.at += 1;
                    if self.peek() == Some(LINE_FEED) {
                        self.at += 1;
                    }
                    self.out.push(LINE_FEED);
                }
                _ => {
                    self.at += 1;
                    self.out.push(unit);
                }
            }
        }
        self.out
    }

    fn as_written(&mut self, start: usize) {
        self.out.extend_from_slice(&self.units[start..self.at]);
    }

    fn code(&mut self, code: u32) {
        let mut buffer = [0u16; 2];
        match char::from_u32(code) {
            Some(character) => self.out.extend_from_slice(character.encode_utf16(&mut buffer)),
            None => self.out.push(code as u16),
        }
    }

    fn octal_digit(&mut self) {
        if digit(self.peek(), 8).is_some() {
            self.at += 1;
        }
    }

    fn hex(&mut self, start: usize, digits: usize) {
        while self.at < start + 2 + digits {
            if digit(self.peek(), 16).is_none() {
                return self.as_written(start);
            }
            self.at += 1;
        }
        let value = self.units[start + 2..self.at].iter().fold(0, |value, unit| value * 16 + digit(Some(*unit), 16).unwrap_or(0));
        self.code(value);
    }

    fn braced(&mut self, start: usize) {
        self.at = start + 3;
        let mut value: Option<u32> = None;
        while let Some(next) = digit(self.peek(), 16) {
            value = Some(value.unwrap_or(0).saturating_mul(16).saturating_add(next));
            self.at += 1;
        }
        let closed = self.peek() == Some(u16::from(b'}'));
        if closed {
            self.at += 1;
        }
        match value {
            Some(value) if closed && value <= 0x10_ffff => self.code(value),
            _ => self.as_written(start),
        }
    }

    fn escape(&mut self) {
        let start = self.at;
        self.at += 1;
        let Some(unit) = self.peek() else { return };
        self.at += 1;
        let simple = |text: &str| text.encode_utf16().collect::<Vec<u16>>();
        match char::from_u32(u32::from(unit)) {
            Some('0') if digit(self.peek(), 10).is_none() => self.out.push(0),
            Some('0'..='3') => {
                self.octal_digit();
                self.octal_digit();
                self.as_written(start);
            }
            Some('4'..='7') => {
                self.octal_digit();
                self.as_written(start);
            }
            Some('8' | '9') => self.as_written(start),
            Some('b') => self.out.extend(simple("\u{8}")),
            Some('t') => self.out.extend(simple("\t")),
            Some('n') => self.out.extend(simple("\n")),
            Some('v') => self.out.extend(simple("\u{b}")),
            Some('f') => self.out.extend(simple("\u{c}")),
            Some('r') => self.out.extend(simple("\r")),
            Some('u') if self.peek() == Some(u16::from(b'{')) => self.braced(start),
            Some('u') => self.hex(start, 4),
            Some('x') => self.hex(start, 2),
            Some('\r') => {
                if self.peek() == Some(LINE_FEED) {
                    self.at += 1;
                }
            }
            Some('\n' | '\u{2028}' | '\u{2029}') => {}
            _ => self.out.push(unit),
        }
    }
}

/// What a JavaScript regular expression matches with `\s`.
pub fn is_space(character: char) -> bool {
    matches!(
        character,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}'
            | '\u{3000}' | '\u{feff}'
    )
}

/// The text the compiler keeps for a BigInt literal: separators dropped, hexadecimal in lower case, binary and
/// octal written in decimal.
pub fn big_integer(source: &str) -> String {
    let text: String = source.chars().filter(|character| *character != '_').collect();
    let digits = text.get(2..text.len().saturating_sub(1)).unwrap_or("");
    match text.as_bytes().get(1).map(u8::to_ascii_lowercase) {
        Some(b'x') => format!("0x{}n", digits.to_ascii_lowercase()),
        Some(b'b') => format!("{}n", decimal(digits, 2)),
        Some(b'o') => format!("{}n", decimal(digits, 8)),
        _ => text,
    }
}

fn decimal(digits: &str, radix: u32) -> String {
    const CHUNK: u64 = 1_000_000_000;
    let mut chunks: Vec<u64> = vec![0];
    for digit in digits.chars().filter_map(|character| character.to_digit(radix)) {
        let mut carry = u64::from(digit);
        for chunk in &mut chunks {
            let value = *chunk * u64::from(radix) + carry;
            *chunk = value % CHUNK;
            carry = value / CHUNK;
        }
        if carry > 0 {
            chunks.push(carry);
        }
    }
    let mut out = chunks.last().map(u64::to_string).unwrap_or_default();
    for chunk in chunks.iter().rev().skip(1) {
        out.push_str(&format!("{chunk:09}"));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(raw: &str) -> String {
        Halves::of(raw).json(Halves::of(raw).from_units(TemplateText::of(raw).read().into_iter()))
    }

    #[test]
    fn keeps_escapes_that_are_not_valid_as_written() {
        assert_eq!(read(r"C:\users\x\n\u{zz}"), "C:\\users\\x\n\\u{zz}");
        assert_eq!(read(r"a\6fr\08\0!"), "a\\6fr\\08\0!");
        assert_eq!(read(r"\u{1F600}\x41\u00e9\xZ"), "\u{1F600}Aé\\xZ");
    }

    #[test]
    fn writes_a_lone_half_the_way_node_does() {
        let halves = Halves::of("x");
        let text = halves.from_units([0x61, 0xd800, 0x62, 0xd83d, 0xde00].into_iter());
        assert_eq!(halves.quoted(&text), "\"a\\ud800b\u{1F600}\"");
        assert_eq!(halves.encoded(&text), "a\u{fffd}b\u{1F600}");
    }

    #[test]
    fn writes_big_integers_as_the_compiler_does() {
        let texts: Vec<String> = ["0xFFn", "0XAn", "0b11n", "0o17n", "0b0n", "0O1n", "1_0n", "0xDEAD_BEEFn"].iter().map(|text| big_integer(text)).collect();
        assert_eq!(texts, ["0xffn", "0xan", "3n", "15n", "0n", "1n", "10n", "0xdeadbeefn"]);
        assert_eq!(big_integer(&format!("0b1{}n", "0".repeat(83))), "9671406556917033397649408n");
    }

    #[test]
    fn avoids_private_use_characters_of_the_file() {
        let source = "\u{100000} \u{100801}";
        let halves = Halves::of(source);
        assert_eq!(halves.json(source.to_string()), source);
        assert_eq!(halves.json(halves.from_units([0xdc00].into_iter())), "\\udc00");
    }
}
