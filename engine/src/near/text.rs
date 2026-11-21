use std::borrow::Cow;
use std::cmp::Ordering;
use std::fmt::Write;

const LONE_BASE: u32 = 0x10_f800;

pub fn lone_unit(character: char) -> Option<u32> {
    let point = character as u32;
    (point >= LONE_BASE).then(|| point - LONE_BASE + 0xd800)
}

fn units(text: &str) -> impl Iterator<Item = u32> + '_ {
    text.chars().flat_map(|character| {
        let point = character as u32;
        let (first, second) = match lone_unit(character) {
            Some(unit) => (unit, None),
            None if point > 0xffff => (0xd800 + ((point - 0x10000) >> 10), Some(0xdc00 + ((point - 0x10000) & 0x3ff))),
            None => (point, None),
        };
        std::iter::once(first).chain(second)
    })
}

pub fn compare_text(left: &str, right: &str) -> Ordering {
    let shared = left.bytes().zip(right.bytes()).take_while(|(one, other)| one == other).count();
    let mut start = shared;
    while !left.is_char_boundary(start) {
        start -= 1;
    }
    units(&left[start..]).cmp(units(&right[start..]))
}

pub fn without_lone(text: &str) -> Cow<'_, str> {
    if !text.chars().any(|character| lone_unit(character).is_some()) {
        return Cow::Borrowed(text);
    }
    let replaced = text.chars().map(|character| if lone_unit(character).is_some() { '\u{fffd}' } else { character });
    Cow::Owned(replaced.collect())
}

fn lone_escape(text: &str, at: usize) -> Option<u32> {
    let bytes = text.as_bytes();
    if bytes.get(at) != Some(&b'\\') || bytes.get(at + 1) != Some(&b'u') {
        return None;
    }
    let unit = u32::from_str_radix(text.get(at + 2..at + 6)?, 16).ok()?;
    (0xd800..=0xdfff).contains(&unit).then_some(unit)
}

pub fn mapped_surrogates(line: &str) -> Option<Cow<'_, str>> {
    if line.as_bytes().contains(&0xf4) && line.chars().any(|character| lone_unit(character).is_some()) {
        return None;
    }
    if !line.contains("\\u") {
        return Some(Cow::Borrowed(line));
    }
    let bytes = line.as_bytes();
    let (mut out, mut at, mut kept) = (String::with_capacity(line.len()), 0, 0);
    while at < bytes.len() {
        if bytes[at] != b'\\' {
            at += 1;
            continue;
        }
        match lone_escape(line, at) {
            Some(high) if high < 0xdc00 && lone_escape(line, at + 6).is_some_and(|low| low >= 0xdc00) => at += 12,
            Some(unit) => {
                out.push_str(&line[kept..at]);
                out.push(char::from_u32(LONE_BASE + unit - 0xd800).expect("mapped"));
                at += 6;
                kept = at;
            }
            None => at += 2,
        }
    }
    out.push_str(&line[kept..]);
    Some(Cow::Owned(out))
}

pub fn json_text(out: &mut String, value: Option<&str>) {
    let Some(value) = value else {
        out.push_str("undefined");
        return;
    };
    out.push('"');
    for character in value.chars() {
        if let Some(unit) = lone_unit(character) {
            write!(out, "\\u{unit:04x}").expect("write");
            continue;
        }
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            control if (control as u32) < 0x20 => {
                write!(out, "\\u{:04x}", control as u32).expect("write");
            }
            other => out.push(other),
        }
    }
    out.push('"');
}
