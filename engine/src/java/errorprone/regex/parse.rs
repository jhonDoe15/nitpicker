//! Alternation, sequences, groups and quantifiers.
use super::study::{MAX, Node, fixed};
use super::{COMMENTS, Parsed, UNIX_LINES, fail};

pub(super) struct Parser {
    pub text: Vec<u32>,
    pub length: usize,
    pub at: usize,
    pub flags: u32,
    pub jdk: u32,
    pub names: Vec<Vec<u32>>,
}

pub(super) fn is(c: u32, wanted: char) -> bool {
    c == u32::from(wanted)
}

pub(super) fn digit(c: u32) -> bool {
    (u32::from('0')..=u32::from('9')).contains(&c)
}

pub(super) fn letter(c: u32) -> bool {
    char::from_u32(c).is_some_and(|c| c.is_ascii_alphabetic())
}

pub(super) fn space(c: u32) -> bool {
    matches!(c, 0x20 | 0x09 | 0x0a | 0x0b | 0x0c | 0x0d)
}

/// What a sequence item is, for how a quantifier after it counts.
#[derive(Clone, Copy, PartialEq)]
pub(super) enum Kind {
    /// One character or class.
    Single,
    /// A group with a body that a quantifier repeats.
    Group,
    /// Any other item: assertions, atomic groups, references, empty items.
    Other,
}

pub(super) type Item = (Vec<Node>, Kind);

fn single() -> Item {
    (vec![Node::Width(1, 1)], Kind::Single)
}

#[derive(Clone, Copy, PartialEq)]
enum Mode {
    Greedy,
    Lazy,
    Possessive,
}

impl Parser {
    pub fn new(mut text: Vec<u32>, flags: u32, jdk: u32) -> Parser {
        let length = text.len();
        text.extend([0, 0]);
        Parser { text, length, at: 0, flags, jdk, names: Vec::new() }
    }

    pub fn raw(&self) -> u32 {
        self.text.get(self.at).copied().unwrap_or(0)
    }

    pub fn raw_at(&self, at: usize) -> u32 {
        self.text.get(at).copied().unwrap_or(0)
    }

    fn line_end(&self, c: u32) -> bool {
        if self.flags & UNIX_LINES != 0 {
            return c == 0x0a;
        }
        matches!(c, 0x0a | 0x0d | 0x85 | 0x2028 | 0x2029)
    }

    /// The next character, past white space and comments when they are ignored.
    pub fn peek(&mut self) -> u32 {
        if self.flags & COMMENTS != 0 {
            loop {
                while self.at < self.text.len() && space(self.raw()) {
                    self.at += 1;
                }
                if !is(self.raw(), '#') {
                    break;
                }
                while self.at < self.length && self.raw() != 0 && !self.line_end(self.raw()) {
                    self.at += 1;
                }
            }
        }
        self.raw()
    }

    pub fn next(&mut self) -> u32 {
        self.at += 1;
        self.peek()
    }

    pub fn run(mut self) -> Parsed<()> {
        self.expression()?;
        let c = self.peek();
        if self.at != self.length {
            if is(c, ')') {
                return Err(super::Failure::Syntax("Unmatched closing ')'".into(), self.at as i64 - 1));
            }
            if self.at == self.length + 1 && is(self.text[self.length - 1], '\\') {
                return fail("Unescaped trailing backslash", self.length);
            }
            return fail("Unexpected internal error", self.at - 1);
        }
        Ok(())
    }

    pub fn expression(&mut self) -> Parsed<Vec<Node>> {
        let mut alternatives = vec![self.sequence()?];
        while is(self.peek(), '|') {
            self.at += 1;
            alternatives.push(self.sequence()?);
        }
        if alternatives.len() == 1 {
            return Ok(alternatives.remove(0));
        }
        Ok(vec![Node::Choice(alternatives)])
    }

    fn sequence(&mut self) -> Parsed<Vec<Node>> {
        let mut nodes = Vec::new();
        loop {
            let c = self.peek();
            let item = match char::from_u32(c).unwrap_or('\u{1}') {
                '(' => match self.group()? {
                    Some(group) => group,
                    None => continue,
                },
                '[' => {
                    self.class(true)?;
                    single()
                }
                '\\' => {
                    self.at += 1;
                    self.escape_item()?
                }
                '^' | '$' => {
                    self.at += 1;
                    (vec![Node::Width(0, 0)], Kind::Other)
                }
                '|' | ')' => break,
                '?' | '*' | '+' => {
                    self.next();
                    return fail(format!("Dangling meta character '{}'", char::from_u32(c).unwrap_or('?')), self.at - 1);
                }
                '{' => (Vec::new(), Kind::Other),
                '\0' if self.at >= self.length => break,
                _ => {
                    self.at += 1;
                    single()
                }
            };
            nodes.extend(self.closure(item)?);
        }
        Ok(nodes)
    }

    fn mode(&mut self) -> Mode {
        let c = self.peek();
        if is(c, '?') || is(c, '+') {
            self.at += 1;
            return if is(c, '?') { Mode::Lazy } else { Mode::Possessive };
        }
        Mode::Greedy
    }

    fn number(&mut self, wrong: &str) -> Parsed<i64> {
        let mut value: i64 = 0;
        while digit(self.peek()) {
            value = value * 10 + i64::from(self.peek() - u32::from('0'));
            if value > i64::from(MAX) {
                return fail(wrong, self.at);
            }
            self.at += 1;
        }
        Ok(value)
    }

    pub fn closure(&mut self, (item, kind): Item) -> Parsed<Vec<Node>> {
        let c = self.peek();
        let (low, high) = match char::from_u32(c).unwrap_or('\0') {
            '?' => {
                self.at += 1;
                let mode = self.mode();
                if kind == Kind::Group && mode != Mode::Possessive {
                    return Ok(vec![Node::Choice(vec![item, Vec::new()])]);
                }
                return Ok(vec![Node::Optional(item)]);
            }
            '*' => (0, MAX),
            '+' => (1, MAX),
            '{' => {
                let brace = self.at;
                if !digit(self.raw_at(brace + 1)) {
                    return fail("Illegal repetition", brace + 1);
                }
                self.at += 1;
                let low = self.number("Illegal repetition range")?;
                let mut high = low;
                let mut open = false;
                if is(self.peek(), ',') {
                    self.at += 1;
                    open = !digit(self.peek());
                    high = if open { i64::from(MAX) } else { self.number("Illegal repetition range")? };
                }
                if !is(self.peek(), '}') {
                    return fail("Unclosed counted closure", self.at);
                }
                if high < low {
                    return fail("Illegal repetition range", self.at);
                }
                self.at += 1;
                let mode = self.mode();
                return Ok(repeat(item, kind, low as i32, high as i32, mode, open));
            }
            _ => return Ok(item),
        };
        self.at += 1;
        let mode = self.mode();
        Ok(repeat(item, kind, low, high, mode, true))
    }
}

/// The node for `item` repeated `low` to `high` times; `open` when no maximum is written.
fn repeat(item: Vec<Node>, kind: Kind, low: i32, high: i32, mode: Mode, open: bool) -> Vec<Node> {
    let node = match kind {
        Kind::Single if open && mode == Mode::Greedy => Node::Greedy(low),
        Kind::Group if mode != Mode::Possessive && !fixed(&item) => Node::Loop,
        _ => Node::Repeat(item, low, high),
    };
    vec![node]
}
