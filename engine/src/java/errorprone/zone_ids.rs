//! Which strings `ZoneId.of` accepts and which time zone ids `TimeZone.getTimeZone` knows, from the documented formats
//! and the identifiers of the JDK that Error Prone ran on.
use super::tz_data::{TIME_ZONE_IDS, ZONE_IDS};

fn units(text: &str) -> Vec<u16> {
    text.encode_utf16().collect()
}

fn digits(text: &[u16], at: usize) -> Option<u32> {
    let (first, second) = (*text.get(at)?, *text.get(at + 1)?);
    let digit = |unit: u16| (u16::from(b'0')..=u16::from(b'9')).contains(&unit).then(|| u32::from(unit - u16::from(b'0')));
    Some(digit(first)? * 10 + digit(second)?)
}

/// `ZoneOffset.of`.
fn offset_of(text: &[u16]) -> bool {
    if text == [u16::from(b'Z')] {
        return true;
    }
    let sign = text.first().copied();
    if sign != Some(u16::from(b'+')) && sign != Some(u16::from(b'-')) {
        return false;
    }
    let colon = |at: usize| text.get(at) == Some(&u16::from(b':'));
    let (hours, minutes, seconds) = match text.len() {
        2 => (text.get(1).and_then(|unit| digits(&[u16::from(b'0'), *unit], 0)), Some(0), Some(0)),
        3 => (digits(text, 1), Some(0), Some(0)),
        5 => (digits(text, 1), digits(text, 3), Some(0)),
        6 if colon(3) => (digits(text, 1), digits(text, 4), Some(0)),
        7 => (digits(text, 1), digits(text, 3), digits(text, 5)),
        9 if colon(3) && colon(6) => (digits(text, 1), digits(text, 4), digits(text, 7)),
        _ => return false,
    };
    let (Some(hours), Some(minutes), Some(seconds)) = (hours, minutes, seconds) else { return false };
    hours <= 18 && minutes <= 59 && seconds <= 59 && (hours < 18 || (minutes == 0 && seconds == 0))
}

fn region_name(text: &[u16]) -> bool {
    text.len() >= 2
        && text.iter().enumerate().all(|(at, unit)| {
            let letter = (u16::from(b'a')..=u16::from(b'z')).contains(unit) || (u16::from(b'A')..=u16::from(b'Z')).contains(unit);
            let digit = (u16::from(b'0')..=u16::from(b'9')).contains(unit);
            letter || (at != 0 && (digit || matches!(u8::try_from(*unit), Ok(b'/' | b'~' | b'.' | b'_' | b'+' | b'-'))))
        })
}

fn region(text: &str) -> bool {
    region_name(&units(text)) && ZONE_IDS.binary_search(&text).is_ok()
}

fn with_prefix(text: &str, length: usize) -> bool {
    let all = units(text);
    if all.len() == length {
        return true;
    }
    if all[length] != u16::from(b'+') && all[length] != u16::from(b'-') {
        return region(text);
    }
    offset_of(&all[length..])
}

/// Whether `ZoneId.of(text)` returns instead of throwing a `DateTimeException`.
pub fn zone_id_valid(text: &str) -> bool {
    let all = units(text);
    if all.len() <= 1 || all[0] == u16::from(b'+') || all[0] == u16::from(b'-') {
        return offset_of(&all);
    }
    if text.starts_with("UTC") || text.starts_with("GMT") {
        return with_prefix(text, 3);
    }
    if text.starts_with("UT") {
        return with_prefix(text, 2);
    }
    region(text)
}

fn custom_time_zone(text: &str) -> bool {
    let Some(rest) = text.strip_prefix("GMT") else { return false };
    let Some(rest) = rest.strip_prefix(['+', '-']) else { return false };
    let bytes = rest.as_bytes();
    let minutes = |tail: &[u8]| tail.is_empty() || (tail.len() == 2 && (b'0'..=b'5').contains(&tail[0]) && tail[1].is_ascii_digit());
    let after_hours = |tail: &[u8]| minutes(tail) || (tail.first() == Some(&b':') && minutes(&tail[1..]));
    let one = bytes.first().is_some_and(u8::is_ascii_digit) && after_hours(&bytes[1..]);
    let two = bytes.len() >= 2 && ((bytes[0] == b'0' || bytes[0] == b'1') && bytes[1].is_ascii_digit() || bytes[0] == b'2' && (b'0'..=b'3').contains(&bytes[1])) && after_hours(&bytes[2..]);
    one || two
}

/// `TimeZone.getAvailableIDs()` or `GMT[+-]h[h][:][mm]`.
pub fn time_zone_valid(text: &str) -> bool {
    TIME_ZONE_IDS.binary_search(&text).is_ok() || custom_time_zone(text)
}
