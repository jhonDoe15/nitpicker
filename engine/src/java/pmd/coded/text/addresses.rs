//! Hard coded IPv4 and IPv6 addresses in string literals.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit;

struct Kinds {
    v4: bool,
    v6: bool,
    mapped: bool,
}

pub fn avoid_using_hard_coded_ip(ctx: &Ctx, out: &mut Vec<Hit>) {
    let checked = ctx.property_list("checkAddressTypes", &["IPv4", "IPv6", "IPv4 mapped IPv6"]);
    let kinds = Kinds {
        v4: checked.iter().any(|kind| kind == "IPv4"),
        v6: checked.iter().any(|kind| kind == "IPv6"),
        mapped: checked.iter().any(|kind| kind == "IPv4 mapped IPv6"),
    };
    for &literal in ctx.all("StringLiteral") {
        let Some(value) = ctx.string_value(literal) else { continue };
        let units: Vec<u16> = value.encode_utf16().collect();
        let Some(&first) = units.first() else { continue };
        let first = char::from_u32(u32::from(first)).map_or(first, |first| upper(first));
        if kinds.v4 && v4(first, &value) || v6(first, &value, &kinds) {
            out.push(hit(literal));
        }
    }
}

fn upper(first: char) -> u16 {
    let mut upper = first.to_uppercase();
    match (upper.next(), upper.next()) {
        (Some(single), None) if (single as u32) < 0x10000 => single as u32 as u16,
        _ => first as u32 as u16,
    }
}

fn digit(unit: u16) -> bool {
    (u16::from(b'0')..=u16::from(b'9')).contains(&unit)
}

fn hex(unit: u16) -> bool {
    digit(unit) || (u16::from(b'A')..=u16::from(b'F')).contains(&unit) || (u16::from(b'a')..=u16::from(b'f')).contains(&unit)
}

fn octets(text: &str) -> Option<Vec<&str>> {
    let parts: Vec<&str> = text.split('.').collect();
    let fits = parts.len() == 4
        && parts.iter().all(|part| (1..=3).contains(&part.len()) && part.bytes().all(|byte| byte.is_ascii_digit()));
    fits.then_some(parts)
}

fn v4(first: u16, text: &str) -> bool {
    if text.encode_utf16().count() < 7 || !digit(first) || !text.contains('.') {
        return false;
    }
    octets(text).is_some_and(|parts| parts.iter().all(|part| part.parse::<u32>().is_ok_and(|octet| octet <= 255)))
}

fn hex_group(part: &str) -> bool {
    (1..=4).contains(&part.len()) && part.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn v6_shape(text: &str) -> bool {
    let Some(last_colon) = text.rfind(':') else { return false };
    let (head, tail) = text.split_at(last_colon + 1);
    let groups = &head[..head.len() - 1];
    let groups_fit = groups.split(':').all(|group| group.is_empty() || hex_group(group));
    groups_fit && (tail.is_empty() || hex_group(tail) || octets(tail).is_some())
}

fn v6(first: u16, text: &str, kinds: &Kinds) -> bool {
    let first_fits = hex(first) || first == u16::from(b':');
    if text.encode_utf16().count() < 3 || !first_fits || text.matches(':').count() < 2 || !v6_shape(text) {
        return false;
    }
    let mut zero_substitution = false;
    let mut rest = text;
    if let Some(stripped) = rest.strip_prefix("::") {
        rest = stripped;
        zero_substitution = true;
    } else if let Some(stripped) = rest.strip_suffix("::") {
        rest = stripped;
        zero_substitution = true;
    }
    if rest.ends_with(':') {
        return false;
    }
    let mut parts: Vec<&str> = rest.split(':').collect();
    while parts.last().is_some_and(|part| part.is_empty()) {
        parts.pop();
    }
    let mut count = 0;
    let mut mapped = false;
    let total = parts.len();
    for (at, part) in parts.into_iter().enumerate() {
        if part.is_empty() {
            if zero_substitution {
                return false;
            }
            zero_substitution = true;
            continue;
        }
        count += 1;
        if !hex_number(part) {
            let first = part.encode_utf16().next().unwrap_or(0);
            if at != total - 1 || !v4(first, part) {
                return false;
            }
            mapped = true;
        }
    }
    match (zero_substitution, mapped) {
        (true, true) => kinds.mapped && (1..=6).contains(&count),
        (true, false) => kinds.v6 && (1..=7).contains(&count),
        (false, true) => kinds.mapped && count == 7,
        (false, false) => kinds.v6 && count == 8,
    }
}

fn hex_number(part: &str) -> bool {
    let digits = part.strip_prefix(['+', '-']).unwrap_or(part);
    !digits.is_empty()
        && digits.chars().all(|unit| unit.is_ascii_hexdigit())
        && i64::from_str_radix(digits, 16).is_ok_and(|value| {
            let value = if part.starts_with('-') { -value } else { value };
            (0..=65535).contains(&value)
        })
}
