//! Character classes in brackets, and the property names `\p` accepts.
use super::escape::{Escaped, Place};
use super::parse::{Parser, is};
use super::{Failure, Parsed, fail};

/// What a class has read so far: items kept as nodes, single characters kept as bits, and whether the last was one.
struct Items {
    node: bool,
    bits: bool,
    last_bits: bool,
}

impl Items {
    fn add(&mut self, bits: bool) {
        self.node |= !bits;
        self.bits |= bits;
        self.last_bits = bits;
    }
}

/// Characters that case-insensitive Unicode matching cannot keep as bits.
const FOLDED: [u32; 10] = [0xff, 0xb5, 0x49, 0x69, 0x53, 0x73, 0x4b, 0x6b, 0xc5, 0xe5];

impl Parser {
    fn single(&self, value: u32) -> bool {
        value < 256 && !(self.flags & 2 != 0 && self.flags & 64 != 0 && FOLDED.contains(&value))
    }

    fn unclosed<T>(&self) -> Parsed<T> {
        fail("Unclosed character class", self.at.saturating_sub(1))
    }

    /// The class whose `[` (or the character before its first item) is at `at`; read past its `]` when `consume`.
    pub fn class(&mut self, consume: bool) -> Parsed<()> {
        let mut items = Items { node: false, bits: false, last_bits: false };
        let mut c = self.next();
        loop {
            match char::from_u32(c).unwrap_or('\u{1}') {
                '^' if is(self.raw_at(self.at - 1), '[') => {
                    c = self.next();
                    continue;
                }
                '[' => {
                    self.class(true)?;
                    items.add(false);
                    c = self.peek();
                    continue;
                }
                '&' => {
                    c = self.next();
                    if !is(c, '&') {
                        self.at -= 1;
                    } else {
                        c = self.next();
                        let mut right = false;
                        while !is(c, ']') && !is(c, '&') {
                            if !is(c, '[') {
                                self.at -= 1;
                            }
                            self.class(is(c, '['))?;
                            right = true;
                            c = self.peek();
                        }
                        if !right && !items.node && !items.bits {
                            return fail("Bad class syntax", self.at - 1);
                        }
                        if !right && items.node && items.last_bits {
                            return fail("Bad intersection syntax", self.at - 1);
                        }
                        items = Items { node: true, bits: false, last_bits: false };
                        continue;
                    }
                }
                '\0' if self.at >= self.length => return self.unclosed(),
                ']' if items.node || items.bits => {
                    if consume {
                        self.next();
                    }
                    return Ok(());
                }
                _ => {}
            }
            let bits = self.range()?;
            items.add(bits);
            c = self.peek();
        }
    }

    /// One character, class escape or range; whether it is kept as bits.
    fn range(&mut self) -> Parsed<bool> {
        let c = self.peek();
        let start = if is(c, '\\') {
            self.at += 1;
            if is(self.raw(), 'p') || is(self.raw(), 'P') {
                self.at += 1;
                return self.family().map(|_| false);
            }
            match self.escape(Place::Class)? {
                Escaped::Char(value) => value,
                _ => return Ok(false),
            }
        } else {
            self.next();
            c
        };
        if !is(self.peek(), '-') {
            return Ok(self.single(start));
        }
        let after = self.raw_at(self.at + 1);
        if is(after, '[') || is(after, ']') {
            return Ok(self.single(start));
        }
        let c = self.next();
        let end = if is(c, '\\') {
            self.at += 1;
            match self.escape(Place::RangeEnd)? {
                Escaped::Char(value) => value,
                _ => return Err(Failure::Unknown),
            }
        } else {
            self.next();
            c
        };
        if end < start {
            return fail("Illegal character range", self.at - 1);
        }
        Ok(false)
    }
}
