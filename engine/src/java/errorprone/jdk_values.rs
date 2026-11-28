//! `Duration.parse`, `Period.parse`, `UUID.fromString` and protobuf's `ByteString.fromHex`, from their documentation and
//! the answers of the JDK 21 to 27.
use super::jdk_parse::digit;

fn ascii_is(unit: u16, letter: u8) -> bool {
    unit == u16::from(letter) || unit == u16::from(letter.to_ascii_lowercase())
}

fn sign(unit: Option<&u16>) -> bool {
    unit.is_some_and(|unit| *unit == u16::from(b'+') || *unit == u16::from(b'-'))
}

/// `[-+]?[0-9]+` followed by the letter at `at`: the number's range and the position after the letter.
fn number(text: &[u16], at: usize, letter: u8) -> Option<(usize, usize, usize)> {
    let digits = at + usize::from(sign(text.get(at)));
    let end = digits + text[digits.min(text.len())..].iter().take_while(|unit| digit(**unit).is_some()).count();
    (end > digits && text.get(end).is_some_and(|unit| ascii_is(*unit, letter))).then_some((at, end, end + 1))
}

/// `Long.parseLong` or `Integer.parseInt` of a range already known to be `[-+]?[0-9]+`.
fn whole(text: &[u16], range: (usize, usize), max: i128) -> Option<i128> {
    let negative = text[range.0] == u16::from(b'-');
    let mut value: i128 = 0;
    for unit in &text[range.0 + usize::from(sign(text.get(range.0)))..range.1] {
        value = value * 10 + i128::from(digit(*unit)?);
        if value > max + 1 {
            return None;
        }
    }
    let value = if negative { -value } else { value };
    (value >= -max - 1 && value <= max).then_some(value)
}

const DURATION: &str = "DateTimeParseException: Text cannot be parsed to a Duration";

pub fn duration(text: &[u16]) -> Option<String> {
    let negate = text.first() == Some(&u16::from(b'-'));
    let mut at = usize::from(sign(text.first()));
    if !text.get(at).is_some_and(|unit| ascii_is(*unit, b'P')) {
        return Some(DURATION.into());
    }
    at += 1;
    let mut groups: [Option<(usize, usize)>; 4] = [None; 4];
    let mut fraction = None;
    if let Some((start, end, next)) = number(text, at, b'D') {
        groups[0] = Some((start, end));
        at = next;
    }
    if text.get(at).is_some_and(|unit| ascii_is(*unit, b'T')) {
        let t = at;
        at += 1;
        for (slot, letter) in [(1, b'H'), (2, b'M')] {
            if let Some((start, end, next)) = number(text, at, letter) {
                groups[slot] = Some((start, end));
                at = next;
            }
        }
        let digits = at + usize::from(sign(text.get(at)));
        let end = digits + text[digits.min(text.len())..].iter().take_while(|unit| digit(**unit).is_some()).count();
        if end > digits {
            let mut close = end;
            let mut part = None;
            if text.get(end).is_some_and(|unit| *unit == u16::from(b'.') || *unit == u16::from(b',')) {
                let count = text[end + 1..].iter().take_while(|unit| digit(**unit).is_some()).count();
                if count <= 9 {
                    close = end + 1 + count;
                    part = Some((end + 1, close));
                }
            }
            if text.get(close).is_some_and(|unit| ascii_is(*unit, b'S')) && (part.is_some() || close == end) {
                groups[3] = Some((at, end));
                fraction = part;
                at = close + 1;
            }
        }
        if at == t + 1 && text[t] == u16::from(b'T') {
            return Some(DURATION.into());
        }
    }
    if at != text.len() || groups.iter().all(Option::is_none) {
        return Some(DURATION.into());
    }
    let labels = ["days", "hours", "minutes", "seconds"];
    let scale: [i128; 4] = [86_400, 3600, 60, 1];
    let long = |value: i128| value <= i128::from(i64::MAX) && value >= i128::from(i64::MIN);
    let mut values = [0i128; 4];
    for slot in 0..4 {
        let Some(range) = groups[slot] else { continue };
        match whole(text, range, i128::from(i64::MAX)).map(|value| value * scale[slot]) {
            Some(value) if long(value) => values[slot] = value,
            _ => return Some(format!("{DURATION}: {}", labels[slot])),
        }
    }
    let mut total = values[3];
    for slot in [2, 1, 0] {
        total += values[slot];
        if !long(total) {
            return Some(format!("{DURATION}: overflow"));
        }
    }
    let mut nanos: i128 = 0;
    if let Some((start, end)) = fraction {
        for unit in &text[start..end] {
            nanos = nanos * 10 + i128::from(digit(*unit).unwrap_or(0));
        }
        for _ in end - start..9 {
            nanos *= 10;
        }
        if groups[3].is_some_and(|(start, _)| text[start] == u16::from(b'-')) {
            nanos = -nanos;
        }
    }
    let mut seconds = total + nanos.div_euclid(1_000_000_000);
    if seconds > i128::from(i64::MAX) || seconds < i128::from(i64::MIN) {
        return Some(format!("{DURATION}: overflow"));
    }
    if negate {
        let all = -(seconds * 1_000_000_000 + nanos.rem_euclid(1_000_000_000));
        seconds = all.div_euclid(1_000_000_000);
        if seconds > i128::from(i64::MAX) || seconds < i128::from(i64::MIN) {
            return Some(format!("{DURATION}: overflow"));
        }
    }
    None
}

const PERIOD: &str = "DateTimeParseException: Text cannot be parsed to a Period";

pub fn period(text: &[u16]) -> Option<String> {
    let negate = text.first() == Some(&u16::from(b'-'));
    let mut at = usize::from(sign(text.first()));
    if !text.get(at).is_some_and(|unit| ascii_is(*unit, b'P')) {
        return Some(PERIOD.into());
    }
    at += 1;
    let mut groups: [Option<(usize, usize)>; 4] = [None; 4];
    for (slot, letter) in [b'Y', b'M', b'W', b'D'].into_iter().enumerate() {
        if let Some((start, end, next)) = number(text, at, letter) {
            groups[slot] = Some((start, end));
            at = next;
        }
    }
    if at != text.len() || groups.iter().all(Option::is_none) {
        return Some(PERIOD.into());
    }
    let mut values = [0i128; 4];
    for slot in 0..4 {
        let Some(range) = groups[slot] else { continue };
        let Some(value) = whole(text, range, i128::from(i32::MAX)) else { return Some(PERIOD.into()) };
        let value = if negate { -value } else { value };
        if value > i128::from(i32::MAX) {
            return Some(PERIOD.into());
        }
        values[slot] = value;
    }
    let days = values[3] + values[2] * 7;
    if values[2] * 7 > i128::from(i32::MAX) || values[2] * 7 < i128::from(i32::MIN) || days > i128::from(i32::MAX) || days < i128::from(i32::MIN) {
        return Some("ArithmeticException: integer overflow".into());
    }
    None
}

/// `Long.parseLong(text, start, end, 16)` failing: its message.
fn parse_long_hex(text: &[u16], start: usize, end: usize, jdk: u32) -> Option<String> {
    if start == end {
        let detail = if jdk >= 22 { "For input string: \"\" under radix 16" } else { "" };
        return Some(format!("NumberFormatException: {detail}"));
    }
    let quoted = String::from_utf16_lossy(&text[start..end]);
    let error = |at: usize| Some(format!("NumberFormatException: Error at index {} in: \"{quoted}\"", at - start));
    let mut at = start;
    let first = text[at];
    let negative = first == u16::from(b'-');
    if first < u16::from(b'0') {
        if !negative && first != u16::from(b'+') {
            return error(at);
        }
        at += 1;
    }
    if at >= end {
        return error(at);
    }
    let limit: i128 = if negative { i128::from(i64::MIN) } else { -i128::from(i64::MAX) };
    let mut result: i128 = 0;
    while at < end {
        let Some(value) = hex_value(text[at]).map(i128::from) else { return error(at) };
        if result < limit / 16 {
            return error(at);
        }
        result *= 16;
        if result < limit + value {
            return error(at);
        }
        result -= value;
        at += 1;
    }
    None
}

fn find_dash(text: &[u16], from: isize) -> isize {
    let from = from.max(0) as usize;
    text.iter().skip(from).position(|unit| *unit == u16::from(b'-')).map_or(-1, |at| (at + from) as isize)
}

pub fn uuid(text: &[u16], jdk: u32) -> Option<String> {
    let name = String::from_utf16_lossy(text);
    if text.len() > 36 {
        return Some("IllegalArgumentException: UUID string too large".into());
    }
    let dash1 = find_dash(text, 0);
    let dash2 = find_dash(text, dash1 + 1);
    let dash3 = find_dash(text, dash2 + 1);
    let dash4 = find_dash(text, dash3 + 1);
    let dash5 = find_dash(text, dash4 + 1);
    if dash4 < 0 || dash5 >= 0 {
        return Some(format!("IllegalArgumentException: Invalid UUID string: {name}"));
    }
    let bounds = [(0, dash1), (dash1 + 1, dash2), (dash2 + 1, dash3), (dash3 + 1, dash4), (dash4 + 1, text.len() as isize)];
    bounds.iter().find_map(|(start, end)| parse_long_hex(text, *start as usize, *end as usize, jdk))
}

const HEX: &str = "NullPointerException: Cannot throw exception because the return value of \
                   \"com.google.common.base.Throwables.getCauseAs(java.lang.Throwable, java.lang.Class)\" is null";

/// Error Prone rethrows the cause of the `NumberFormatException` that `fromHex` throws, which is null.
pub fn hex(text: &[u16]) -> Option<String> {
    let valid = text.len() % 2 == 0 && text.iter().all(|unit| *unit < 128 && (*unit as u8).is_ascii_hexdigit());
    (!valid).then(|| HEX.into())
}

/// `Character.digit(unit, 16)`: outside ASCII, the decimal digit blocks of the Basic Multilingual Plane (the same on
/// JDK 21 to 27) and the fullwidth Latin letters.
const ZEROS: [u16; 36] = [
    0x0660, 0x06F0, 0x07C0, 0x0966, 0x09E6, 0x0A66, 0x0AE6, 0x0B66, 0x0BE6, 0x0C66, 0x0CE6, 0x0D66, 0x0DE6, 0x0E50, 0x0ED0, 0x0F20,
    0x1040, 0x1090, 0x17E0, 0x1810, 0x1946, 0x19D0, 0x1A80, 0x1A90, 0x1B50, 0x1BB0, 0x1C40, 0x1C50, 0xA620, 0xA8D0, 0xA900, 0xA9D0,
    0xA9F0, 0xAA50, 0xABF0, 0xFF10,
];

pub fn hex_value(unit: u16) -> Option<u16> {
    match unit {
        0x30..=0x39 => Some(unit - 0x30),
        0x41..=0x46 => Some(unit - 0x41 + 10),
        0x61..=0x66 => Some(unit - 0x61 + 10),
        0xFF21..=0xFF26 => Some(unit - 0xFF21 + 10),
        0xFF41..=0xFF46 => Some(unit - 0xFF41 + 10),
        _ => ZEROS.iter().find(|zero| (**zero..**zero + 10).contains(&unit)).map(|zero| unit - zero),
    }
}
