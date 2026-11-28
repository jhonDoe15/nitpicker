//! Offsets as `appendOffsetId()` parses them (pattern `+HH:MM:ss`) and zone region ids as `appendZoneRegionId()` does.
use super::format::{Ctx, Field, Zone, digit};
use super::super::tz_data::ZONE_IDS;

fn two_digits(text: &[u16], colon: bool, slot: usize, state: &mut [i64; 4]) -> bool {
    let mut at = state[0];
    if at < 0 {
        return true;
    }
    if colon && slot != 1 {
        if at as usize + 1 > text.len() || text[at as usize] != u16::from(b':') {
            return false;
        }
        at += 1;
    }
    let at = at as usize;
    if at + 2 > text.len() {
        return false;
    }
    let (Some(first), Some(second)) = (digit(text[at]), digit(text[at + 1])) else { return false };
    let value = first * 10 + second;
    if value > 59 {
        return false;
    }
    state[slot] = value;
    state[0] = at as i64 + 2;
    true
}

/// `OffsetIdPrinterParser` for `+HH:MM:ss` with the given text for a zero offset.
pub fn offset_id(ctx: &mut Ctx, text: &[u16], position: usize, no_offset: u16) -> Result<isize, String> {
    offset(ctx, text, position, no_offset, true)
}

/// With `colon` false the pattern is `+HH`: parsed leniently, a colon after the hours decides whether colons follow.
pub fn offset(ctx: &mut Ctx, text: &[u16], position: usize, no_offset: u16, colon: bool) -> Result<isize, String> {
    if position == text.len() {
        return Ok(!(position as isize));
    }
    if ctx.char_equals(text[position], no_offset) {
        return Ok(ctx.set(Field::Offset, 0, position, position + 1));
    }
    let sign = text[position];
    if sign != u16::from(b'+') && sign != u16::from(b'-') {
        return Ok(!(position as isize));
    }
    let negative = if sign == u16::from(b'-') { -1 } else { 1 };
    let mut state = [position as i64 + 1, 0, 0, 0];
    if !two_digits(text, false, 1, &mut state) {
        state[0] = !state[0];
    }
    if ctx.strict {
        if !two_digits(text, true, 2, &mut state) {
            state[0] = !state[0];
        }
        two_digits(text, true, 3, &mut state);
    } else {
        let colon = colon || text.get(position + 3) == Some(&u16::from(b':'));
        if two_digits(text, colon, 2, &mut state) {
            two_digits(text, colon, 3, &mut state);
        }
    }
    if state[0] > 0 {
        if state[1] > 23 || state[2] > 59 || state[3] > 59 {
            return Err("Value out of range: Hour[0-23], Minute[0-59], Second[0-59]".into());
        }
        let seconds = negative * (state[1] * 3600 + state[2] * 60 + state[3]);
        return Ok(ctx.set(Field::Offset, seconds, position, state[0] as usize));
    }
    Ok(!(position as isize))
}

fn offset_based(ctx: &mut Ctx, text: &[u16], prefix_at: usize, position: usize, zero: bool) -> Result<isize, String> {
    let prefix = String::from_utf16_lossy(&text[prefix_at..position]).to_uppercase();
    if position >= text.len() || text[position] == u16::from(b'0') || ctx.char_equals(text[position], u16::from(b'Z')) {
        ctx.current().zone = Some(Zone::Region(prefix));
        return Ok(position as isize);
    }
    let mut inner = ctx.copy();
    let end = offset_id(&mut inner, text, position, if zero { u16::from(b'0') } else { u16::from(b'Z') })?;
    if end < 0 {
        if !zero {
            return Ok(!(prefix_at as isize));
        }
        ctx.current().zone = Some(Zone::Region(prefix));
        return Ok(position as isize);
    }
    let seconds = inner.current().get(Field::Offset).unwrap_or(0);
    if seconds.abs() > 18 * 3600 {
        return Ok(!(prefix_at as isize));
    }
    ctx.current().zone = Some(if prefix.is_empty() { Zone::Offset(seconds) } else { Zone::Region(prefix) });
    Ok(end)
}

fn longest_id(ctx: &Ctx, text: &[u16], position: usize) -> Option<usize> {
    let mut best = None;
    for id in ZONE_IDS {
        let units: Vec<u16> = id.encode_utf16().collect();
        let end = position + units.len();
        if end <= text.len() && units.iter().zip(&text[position..end]).all(|(a, b)| ctx.char_equals(*b, *a)) {
            best = best.max(Some(end));
        }
    }
    best
}

/// `ZoneIdPrinterParser` for region ids.
pub fn region_id(ctx: &mut Ctx, text: &[u16], position: usize) -> Result<isize, String> {
    let length = text.len();
    if position == length {
        return Ok(!(position as isize));
    }
    let next = text[position];
    if next == u16::from(b'+') || next == u16::from(b'-') {
        return offset_based(ctx, text, position, position, false);
    }
    if length >= position + 2 {
        let second = text[position + 1];
        let is = |unit: u16, letter: u8| ctx.char_equals(unit, u16::from(letter));
        if is(next, b'U') && is(second, b'T') {
            if length >= position + 3 && is(text[position + 2], b'C') {
                return offset_based(ctx, text, position, position + 3, true);
            }
            return offset_based(ctx, text, position, position + 2, true);
        }
        if is(next, b'G') && length >= position + 3 && is(second, b'M') && is(text[position + 2], b'T') {
            if length >= position + 4 && is(text[position + 3], b'0') {
                ctx.current().zone = Some(Zone::Region("GMT0".into()));
                return Ok(position as isize + 4);
            }
            return offset_based(ctx, text, position, position + 3, true);
        }
    }
    match longest_id(ctx, text, position) {
        Some(end) => {
            ctx.current().zone = Some(Zone::Region(String::from_utf16_lossy(&text[position..end])));
            Ok(end as isize)
        }
        None if ctx.char_equals(next, u16::from(b'Z')) => {
            ctx.current().zone = Some(Zone::Offset(0));
            Ok(position as isize + 1)
        }
        None => Ok(!(position as isize)),
    }
}
