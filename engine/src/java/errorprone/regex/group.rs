//! Groups: capturing, named, non-capturing, look-around, atomic and inline flags.
use super::parse::{Item, Kind, Parser, digit, is, letter};
use super::study::{Node, bounded};
use super::{COMMENTS, Parsed, fail};

const FLAG_LETTERS: &[(char, u32)] = &[('i', 2), ('d', 1), ('m', 8), ('s', 32), ('u', 64), ('c', 128), ('x', COMMENTS), ('U', 320)];

enum Shape {
    Capturing,
    Plain,
    Atomic,
    Around,
    Behind,
    Flagged,
}

impl Parser {
    /// A group name after `<`, up to and past its `>`.
    pub fn group_name(&mut self) -> Parsed<Vec<u32>> {
        if !letter(self.peek()) {
            return fail("capturing group name does not start with a Latin letter", self.at);
        }
        let mut name = Vec::new();
        while letter(self.peek()) || digit(self.peek()) {
            name.push(self.peek());
            self.at += 1;
        }
        if !is(self.peek(), '>') {
            return fail("named capturing group is missing trailing '>'", self.at);
        }
        self.at += 1;
        Ok(name)
    }

    /// Inline flags after `(?`, up to `)` or `:`; each one applies as soon as it is read.
    fn inline_flags(&mut self) -> Parsed<()> {
        let mut adding = true;
        loop {
            let c = self.peek();
            if is(c, ')') || is(c, ':') {
                return Ok(());
            }
            if is(c, '-') && adding {
                adding = false;
                self.at += 1;
                continue;
            }
            let Some((_, bits)) = FLAG_LETTERS.iter().find(|(letter, _)| is(c, *letter)) else {
                return fail("Unknown inline modifier", self.at);
            };
            self.flags = if adding { self.flags | bits } else { self.flags & !bits };
            self.at += 1;
        }
    }

    /// The group at `(`; `None` for a group of inline flags alone.
    pub fn group(&mut self) -> Parsed<Option<Item>> {
        self.at += 1;
        let saved = self.flags;
        let shape = if is(self.peek(), '?') {
            self.at += 1;
            let c = self.raw();
            self.at += 1;
            match char::from_u32(c).unwrap_or('\0') {
                ':' => Shape::Plain,
                '>' => Shape::Atomic,
                '$' | '@' => return fail("Unknown group type", self.at - 1),
                '=' | '!' => Shape::Around,
                '<' => {
                    let c = self.peek();
                    if is(c, '=') || is(c, '!') {
                        self.at += 1;
                        Shape::Behind
                    } else {
                        let name = self.group_name()?;
                        if self.names.contains(&name) {
                            let shown: String = name.iter().filter_map(|c| char::from_u32(*c)).collect();
                            return fail(format!("Named capturing group <{shown}> is already defined"), self.at - 1);
                        }
                        self.names.push(name);
                        Shape::Capturing
                    }
                }
                _ => {
                    self.at -= 1;
                    self.inline_flags()?;
                    let close = is(self.peek(), ')');
                    self.at += 1;
                    if close {
                        return Ok(None);
                    }
                    Shape::Flagged
                }
            }
        } else {
            Shape::Capturing
        };
        let canonical = self.flags & super::CANON_EQ != 0;
        let body = self.expression()?;
        let close = self.peek();
        if matches!(shape, Shape::Behind) && (canonical || self.flags & super::CANON_EQ != 0) {
            return Err(super::Failure::Unknown);
        }
        if matches!(shape, Shape::Behind) && !bounded(&body) {
            return fail("Look-behind group does not have an obvious maximum length", self.at - 1);
        }
        if !is(close, ')') {
            return fail("Unclosed group", self.at);
        }
        self.at += 1;
        self.flags = saved;
        Ok(Some(match shape {
            Shape::Around | Shape::Behind => (Vec::new(), Kind::Other),
            Shape::Atomic => (vec![Node::Atomic(body)], Kind::Other),
            _ => (body, Kind::Group),
        }))
    }
}
