//! The parsing side of `java.time.format.DateTimeFormatter` for the ISO formats that the `parse` methods of `java.time`
//! use, written from the `DateTimeFormatterBuilder` documentation and checked against the JDK by differential cases.
use super::offset::{offset, offset_id, region_id};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Field {
    Year,
    Month,
    Day,
    Hour,
    Minute,
    Second,
    Nano,
    Offset,
    InstantSeconds,
    Micro,
    Milli,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Sign {
    NotNegative,
    ExceedsPad,
}

pub enum El {
    Lit(u8),
    Text(&'static [u8]),
    Value(Field, usize, usize, Sign),
    Fraction,
    Offset,
    OffsetHours,
    Region,
    Instant,
    Insensitive,
    Sensitive,
    Lenient,
    Strict,
    Seq(&'static [El]),
    Opt(&'static [El]),
}

#[derive(Clone, Debug, PartialEq)]
pub enum Zone {
    Offset(i64),
    Region(String),
}

#[derive(Clone, Default)]
pub struct Parsed {
    pub fields: Vec<(Field, i64)>,
    pub zone: Option<Zone>,
}

impl Parsed {
    pub fn get(&self, field: Field) -> Option<i64> {
        self.fields.iter().find(|(key, _)| *key == field).map(|(_, value)| *value)
    }

    pub fn remove(&mut self, field: Field) -> Option<i64> {
        let at = self.fields.iter().position(|(key, _)| *key == field)?;
        Some(self.fields.remove(at).1)
    }

    pub fn put(&mut self, field: Field, value: i64) -> Option<i64> {
        match self.fields.iter_mut().find(|(key, _)| *key == field) {
            Some(entry) => Some(std::mem::replace(&mut entry.1, value)),
            None => {
                self.fields.push((field, value));
                None
            }
        }
    }
}

/// A parse step's answer: the next position, or `!position` of the error as in the JDK; `Err` is a thrown message.
pub type Step = Result<isize, String>;

#[derive(Clone)]
pub struct Ctx {
    pub jdk: u32,
    pub strict: bool,
    pub sensitive: bool,
    pub parsed: Vec<Parsed>,
}

impl Ctx {
    pub fn new(jdk: u32) -> Ctx {
        Ctx { jdk, strict: true, sensitive: true, parsed: vec![Parsed::default()] }
    }

    pub fn copy(&self) -> Ctx {
        Ctx { jdk: self.jdk, strict: self.strict, sensitive: self.sensitive, parsed: vec![Parsed::default()] }
    }

    pub fn current(&mut self) -> &mut Parsed {
        self.parsed.last_mut().expect("parsed")
    }

    pub fn set(&mut self, field: Field, value: i64, error: usize, success: usize) -> isize {
        match self.current().put(field, value) {
            Some(old) if old != value => !(error as isize),
            _ => success as isize,
        }
    }

    pub fn char_equals(&self, first: u16, second: u16) -> bool {
        first == second || (!self.sensitive && first < 128 && second < 128 && fold(first) == fold(second))
    }
}

fn fold(unit: u16) -> u16 {
    if (u16::from(b'a')..=u16::from(b'z')).contains(&unit) { unit - 32 } else { unit }
}

pub fn digit(unit: u16) -> Option<i64> {
    (u16::from(b'0')..=u16::from(b'9')).contains(&unit).then(|| i64::from(unit - u16::from(b'0')))
}

fn sign_allowed(sign: Sign, positive: bool, strict: bool, fixed: bool) -> bool {
    match sign {
        Sign::ExceedsPad => true,
        Sign::NotNegative => {
            let _ = positive;
            !strict && !fixed
        }
    }
}

fn value(ctx: &mut Ctx, text: &[u16], start: usize, field: Field, min: usize, max: usize, sign: Sign) -> isize {
    let length = text.len();
    let mut position = start;
    if position == length {
        return !(position as isize);
    }
    let fixed = min == max;
    let mut negative = false;
    let mut positive = false;
    let first = text[position];
    if first == u16::from(b'+') || first == u16::from(b'-') {
        let plus = first == u16::from(b'+');
        if !sign_allowed(sign, plus, ctx.strict, fixed) {
            return !(position as isize);
        }
        positive = plus;
        negative = !plus;
        position += 1;
    }
    let effective_min = if ctx.strict || fixed { min } else { 1 };
    let min_end = position + effective_min;
    if min_end > length {
        return !(position as isize);
    }
    let effective_max = if ctx.strict || fixed { max } else { 9 };
    let max_end = (position + effective_max).min(length);
    let mut total: i64 = 0;
    let mut at = position;
    while at < max_end {
        let Some(next) = digit(text[at]) else {
            if at < min_end {
                return !(position as isize);
            }
            break;
        };
        at += 1;
        total = total * 10 + next;
    }
    if negative {
        if total == 0 && ctx.strict {
            return !(position as isize - 1);
        }
        total = -total;
    } else if sign == Sign::ExceedsPad && ctx.strict {
        let width = at - position;
        if positive {
            if width <= min {
                return !(position as isize - 1);
            }
        } else if width > min {
            return !(position as isize);
        }
    }
    ctx.set(field, total, position, at)
}

fn fraction(ctx: &mut Ctx, text: &[u16], start: usize) -> isize {
    let mut position = start;
    if position == text.len() || text[position] != u16::from(b'.') {
        return position as isize;
    }
    position += 1;
    let max_end = (position + 9).min(text.len());
    let mut total: i64 = 0;
    let mut at = position;
    while at < max_end {
        let Some(next) = digit(text[at]) else { break };
        total = total * 10 + next;
        at += 1;
    }
    for _ in at - position..9 {
        total *= 10;
    }
    ctx.set(Field::Nano, total, position, at)
}

pub fn parse(ctx: &mut Ctx, elements: &[El], text: &[u16], start: usize) -> Step {
    let mut position = start as isize;
    for element in elements {
        position = one(ctx, element, text, position as usize)?;
        if position < 0 {
            return Ok(position);
        }
    }
    Ok(position)
}

fn one(ctx: &mut Ctx, element: &El, text: &[u16], position: usize) -> Step {
    Ok(match element {
        El::Lit(literal) => {
            if position == text.len() || !ctx.char_equals(text[position], u16::from(*literal)) {
                !(position as isize)
            } else {
                position as isize + 1
            }
        }
        El::Text(literal) => {
            let end = position + literal.len();
            let matched = end <= text.len() && literal.iter().zip(&text[position..end]).all(|(a, b)| ctx.char_equals(*b, u16::from(*a)));
            if matched { end as isize } else { !(position as isize) }
        }
        El::Value(field, min, max, sign) => value(ctx, text, position, *field, *min, *max, *sign),
        El::Fraction => fraction(ctx, text, position),
        El::Offset => offset_id(ctx, text, position, u16::from(b'Z'))?,
        El::OffsetHours => offset(ctx, text, position, u16::from(b'Z'), false)?,
        El::Region => region_id(ctx, text, position)?,
        El::Instant => super::instant::instant(ctx, text, position)?,
        El::Insensitive => {
            ctx.sensitive = false;
            position as isize
        }
        El::Sensitive => {
            ctx.sensitive = true;
            position as isize
        }
        El::Lenient => {
            ctx.strict = false;
            position as isize
        }
        El::Strict => {
            ctx.strict = true;
            position as isize
        }
        El::Seq(inner) => parse(ctx, inner, text, position)?,
        El::Opt(inner) => {
            let saved = ctx.current().clone();
            ctx.parsed.push(saved);
            let end = parse(ctx, inner, text, position)?;
            let kept = ctx.parsed.pop().expect("optional");
            if end < 0 {
                position as isize
            } else {
                *ctx.current() = kept;
                end
            }
        }
    })
}
