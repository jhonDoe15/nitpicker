//! Escapes after `\`, inside and outside character classes, and `\p{...}` property names.
use super::parse::{Item, Kind, Parser, is};
use super::study::Node;
use super::{Failure, Parsed, fail};

/// What an escape stands for.
pub(super) enum Escaped {
    Char(u32),
    Class,
    Other(Node),
}

/// Where an escape is read.
#[derive(Clone, Copy, PartialEq)]
pub(super) enum Place {
    Sequence,
    Class,
    RangeEnd,
}

fn hex(c: u32) -> Option<u32> {
    char::from_u32(c).and_then(|c| c.to_digit(16))
}

fn octal(c: u32) -> Option<u32> {
    char::from_u32(c).and_then(|c| c.to_digit(8))
}

impl Parser {
    /// An escape in a sequence, with `at` after the backslash.
    pub fn escape_item(&mut self) -> Parsed<Item> {
        match self.escape(Place::Sequence)? {
            Escaped::Char(_) | Escaped::Class => Ok((vec![Node::Width(1, 1)], Kind::Single)),
            Escaped::Other(node) => Ok((vec![node], Kind::Other)),
        }
    }

    fn unsupported<T>(&self, at: usize) -> Parsed<T> {
        fail("Illegal/unsupported escape sequence", at)
    }

    /// The escape whose character is at `at`, read past.
    pub fn escape(&mut self, place: Place) -> Parsed<Escaped> {
        let start = self.at;
        if start >= self.length {
            self.at += 1;
            return Ok(Escaped::Char(0));
        }
        let c = self.raw();
        self.at += 1;
        let inside = place != Place::Sequence;
        let boundary = |parser: &Parser| if inside { parser.unsupported(start) } else { Ok(Escaped::Other(Node::Width(0, 0))) };
        let Some(letter) = char::from_u32(c) else { return Ok(Escaped::Char(c)) };
        match letter {
            '0' => self.octal(),
            '1'..='9' if inside => self.unsupported(start),
            '1'..='9' => {
                while super::parse::digit(self.peek()) {
                    self.at += 1;
                }
                Ok(Escaped::Other(Node::Reference))
            }
            'a' => Ok(Escaped::Char(7)),
            'e' => Ok(Escaped::Char(27)),
            'f' => Ok(Escaped::Char(12)),
            'n' => Ok(Escaped::Char(10)),
            'r' => Ok(Escaped::Char(13)),
            't' => Ok(Escaped::Char(9)),
            'd' | 'D' | 'h' | 'H' | 's' | 'S' | 'v' | 'V' | 'w' | 'W' => {
                if place == Place::RangeEnd {
                    return fail("Illegal character range", self.at - 1);
                }
                Ok(Escaped::Class)
            }
            'b' => {
                if inside {
                    return self.unsupported(start);
                }
                if is(self.peek(), '{') && is(self.raw_at(self.at + 1), 'g') {
                    self.at += 2;
                    if !is(self.peek(), '}') {
                        return self.unsupported(self.at);
                    }
                    self.at += 1;
                }
                Ok(Escaped::Other(Node::Width(0, 0)))
            }
            'B' | 'A' | 'G' | 'z' | 'Z' => boundary(self),
            'R' if !inside => Ok(Escaped::Other(Node::LineBreak)),
            'X' if !inside => Ok(Escaped::Other(Node::Grapheme)),
            'c' => {
                if self.at >= self.length {
                    return fail("Illegal control escape sequence", self.at - 1);
                }
                let control = self.peek() ^ 64;
                self.at += 1;
                Ok(Escaped::Char(control))
            }
            'k' if !inside => self.named_reference(),
            'N' => self.character_name(),
            'p' | 'P' if place == Place::RangeEnd => self.unsupported(start),
            'p' | 'P' => {
                self.family()?;
                Ok(Escaped::Class)
            }
            'u' => self.unicode(),
            'x' => self.hexadecimal(),
            _ if letter.is_ascii_alphanumeric() => self.unsupported(start),
            _ => Ok(Escaped::Char(c)),
        }
    }

    /// The `}` after the `{` at `open`, skipping comments when they are ignored.
    fn closing(&mut self, start: usize) -> Option<usize> {
        self.at = start;
        loop {
            let c = self.peek();
            if self.at >= self.length {
                return None;
            }
            if is(c, '}') {
                return Some(self.at);
            }
            self.at += 1;
        }
    }

    fn octal(&mut self) -> Parsed<Escaped> {
        let Some(first) = octal(self.peek()) else { return fail("Illegal octal escape sequence", self.at) };
        self.at += 1;
        let mut value = first;
        if let Some(second) = octal(self.peek()) {
            self.at += 1;
            value = value * 8 + second;
            if first <= 3
                && let Some(third) = octal(self.peek())
            {
                self.at += 1;
                value = value * 8 + third;
            }
        }
        Ok(Escaped::Char(value))
    }

    fn named_reference(&mut self) -> Parsed<Escaped> {
        if !is(self.peek(), '<') {
            return fail("\\k is not followed by '<' for named capturing group", self.at);
        }
        self.at += 1;
        let name = self.group_name()?;
        if !self.names.contains(&name) {
            let shown: String = name.iter().filter_map(|c| char::from_u32(*c)).collect();
            return fail(format!("named capturing group <{shown}> does not exist"), self.at - 1);
        }
        Ok(Escaped::Other(Node::Reference))
    }

    fn character_name(&mut self) -> Parsed<Escaped> {
        if !is(self.peek(), '{') {
            return fail("Illegal character name escape sequence", self.at);
        }
        let open = self.at;
        self.at += 1;
        let close = loop {
            let c = self.peek();
            self.at += 1;
            if is(c, '}') {
                break self.at - 1;
            }
            if self.at >= self.length {
                return fail("Unclosed character name escape sequence", self.at - 1);
            }
        };
        let name: String = self.text[open + 1..close].iter().map(|c| char::from_u32(*c).unwrap_or('\u{fffd}')).collect();
        let trimmed = name.trim_matches(|c: char| c <= ' ');
        if trimmed.is_empty() || trimmed.chars().any(|c| !c.is_ascii_alphanumeric() && c != ' ' && c != '-') || trimmed.contains("  ") {
            return fail(format!("Unknown character name [{name}]"), close);
        }
        Err(Failure::Unknown)
    }

    fn unicode(&mut self) -> Parsed<Escaped> {
        let mut value = 0;
        for _ in 0..4 {
            let Some(digit) = hex(self.peek()) else { return fail("Illegal Unicode escape sequence", self.at) };
            value = value * 16 + digit;
            self.at += 1;
        }
        if (0xd800..0xdc00).contains(&value) && is(self.raw(), '\\') && is(self.raw_at(self.at + 1), 'u') {
            let low = (2..6).try_fold(0, |sum, offset| hex(self.raw_at(self.at + offset)).map(|digit| sum * 16 + digit));
            if let Some(low) = low.filter(|low| (0xdc00..0xe000).contains(low)) {
                self.at += 6;
                return Ok(Escaped::Char(0x10000 + ((value - 0xd800) << 10) + (low - 0xdc00)));
            }
        }
        Ok(Escaped::Char(value))
    }

    fn hexadecimal(&mut self) -> Parsed<Escaped> {
        let first = self.peek();
        if let Some(high) = hex(first) {
            self.at += 1;
            let Some(low) = hex(self.peek()) else { return fail("Illegal hexadecimal escape sequence", self.at) };
            self.at += 1;
            return Ok(Escaped::Char(high * 16 + low));
        }
        let open = self.at;
        if !is(first, '{') {
            return fail("Illegal hexadecimal escape sequence", open);
        }
        self.at += 1;
        if hex(self.peek()).is_none() {
            return fail("Illegal hexadecimal escape sequence", self.at - 1);
        }
        let mut value: u32 = 0;
        while let Some(digit) = hex(self.peek()) {
            value = value.saturating_mul(16).saturating_add(digit);
            if value > 0x10ffff {
                return fail("Hexadecimal codepoint is too big", self.at);
            }
            self.at += 1;
        }
        if !is(self.peek(), '}') {
            return fail("Unclosed hexadecimal escape sequence", self.at);
        }
        self.at += 1;
        Ok(Escaped::Char(value))
    }

    /// A property after `\p` or `\P`: one letter, or a name in braces.
    pub fn family(&mut self) -> Parsed<()> {
        let c = self.peek();
        let name: Vec<u32> = if is(c, '{') {
            self.at += 1;
            let start = self.at;
            if is(self.peek(), '}') {
                return fail("Empty character family", self.at);
            }
            let start = start.max(self.at);
            let Some(close) = self.closing(start) else {
                return fail("Unclosed character family", self.length);
            };
            self.at = close + 1;
            self.text[start..close].to_vec()
        } else {
            self.at += 1;
            vec![c]
        };
        let name: String = name.iter().map(|c| char::from_u32(*c).unwrap_or('\u{fffd}')).collect();
        super::names::property(&name, self.jdk, self.flags & super::UNICODE_CHARACTER_CLASS != 0).map_err(|description| Failure::Syntax(description, self.at as i64 - 1))
    }
}
