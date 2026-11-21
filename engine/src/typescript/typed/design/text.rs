//! Type text that does not depend on the compiler's release: the members of every union
//! and the members of every object type in a fixed order (one release lists them as it met them, the next
//! sorts them). Mirrors nitpicker's `withSortedUnions`.
const CUTS: &[&str] = &[" is ", " extends ", " in ", " as ", "=>", ";", ",", "?", ":"];

fn quoted_end(text: &[char], start: usize) -> usize {
    let mut index = start + 1;
    while index < text.len() && text[index] != text[start] {
        index += if text[index] == '\\' { 2 } else { 1 };
    }
    (index + 1).min(text.len())
}

fn escaped_unit(text: &[char], index: usize) -> Option<u16> {
    if text[index] != '\\' || text.get(index + 1) != Some(&'u') || index + 6 > text.len() {
        return None;
    }
    let digits: String = text[index + 2..index + 6].iter().collect();
    let all_hex = digits.chars().all(|digit| digit.is_ascii_hexdigit());
    u16::from_str_radix(&digits, 16).ok().filter(|unit| all_hex && *unit >= 0x80)
}

fn push_units(units: &mut Vec<u16>, result: &mut String) {
    for decoded in char::decode_utf16(units.drain(..)) {
        match decoded {
            Ok(character) => result.push(character),
            Err(lone) => result.push_str(&format!("\\u{:04X}", lone.unpaired_surrogate())),
        }
    }
}

/// A template type from its opening quote: its non-ASCII characters written raw (one compiler release writes
/// them as `\uXXXX`, the next raw) and the types of its placeholders in the fixed order.
fn template_from(text: &[char], start: usize) -> (String, usize) {
    let mut result = String::from("`");
    let mut units: Vec<u16> = Vec::new();
    let mut index = start + 1;
    while index < text.len() {
        if let Some(unit) = escaped_unit(text, index) {
            units.push(unit);
            index += 6;
            continue;
        }
        push_units(&mut units, &mut result);
        let character = text[index];
        if character == '`' {
            result.push(character);
            return (result, index + 1);
        }
        if character == '\\' {
            result.extend(&text[index..(index + 2).min(text.len())]);
            index += 2;
        } else if character == '$' && text.get(index + 1) == Some(&'{') {
            let (inner, close) = level_from(text, index + 2, false);
            result.push_str("${");
            result.push_str(&inner);
            result.extend(text.get(close));
            index = close + 1;
        } else {
            result.push(character);
            index += 1;
        }
    }
    push_units(&mut units, &mut result);
    (result, text.len())
}

fn sorted_members(members: &[String], member: &str) -> String {
    let mut all: Vec<&str> = members.iter().map(String::as_str).chain([member]).map(|member| member.trim_matches(' ')).collect();
    all.sort_by_cached_key(|member| member.encode_utf16().collect::<Vec<u16>>());
    all.join(" | ")
}

fn cut_at(text: &[char], index: usize) -> Option<&'static str> {
    CUTS.iter().copied().find(|cut| cut.chars().enumerate().all(|(offset, character)| text.get(index + offset) == Some(&character)))
}

fn sorted_entries(mut entries: Vec<String>, sorted: bool) -> String {
    if sorted {
        entries = entries.iter().map(|entry| entry.trim_matches(' ').to_string()).collect();
        entries.sort_by_cached_key(|entry| entry.encode_utf16().collect::<Vec<u16>>());
    }
    entries.iter().map(|entry| format!("{entry};")).collect()
}

fn level_from(text: &[char], start: usize, sorted: bool) -> (String, usize) {
    let mut entries: Vec<String> = Vec::new();
    let mut done = String::new();
    let mut members: Vec<String> = Vec::new();
    let mut member = String::new();
    let mut index = start;
    while index < text.len() && !matches!(text[index], ')' | ']' | '}') {
        let character = text[index];
        if character == '`' {
            let (written, end) = template_from(text, index);
            member.push_str(&written);
            index = end;
        } else if matches!(character, '"' | '\'') {
            let end = quoted_end(text, index);
            member.extend(&text[index..end]);
            index = end;
        } else if matches!(character, '(' | '[' | '{') {
            let (inner, end) = level_from(text, index + 1, character == '{');
            member.push(character);
            member.push_str(&inner);
            member.extend(text.get(end));
            index = end + 1;
        } else if let Some(cut) = cut_at(text, index) {
            done.push_str(&sorted_members(&members, &member));
            if cut == ";" {
                entries.push(std::mem::take(&mut done));
            } else {
                done.push_str(cut);
            }
            members.clear();
            member.clear();
            index += cut.len();
        } else {
            if character == '|' {
                members.push(std::mem::take(&mut member));
            } else {
                member.push(character);
            }
            index += 1;
        }
    }
    done.push_str(&sorted_members(&members, &member));
    (sorted_entries(entries, sorted) + &done, index)
}

pub fn with_sorted_unions(text: &str) -> String {
    let text: Vec<char> = text.chars().collect();
    let mut result = String::new();
    let mut index = 0;
    while index <= text.len() {
        let (level, end) = level_from(&text, index, false);
        result.push_str(&level);
        result.extend(text.get(end));
        index = end + 1;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unions_are_written_in_one_order() {
        let cases = [
            ("string", "string"),
            ("\"b\" | \"a\"", "\"a\" | \"b\""),
            ("B | A | undefined", "A | B | undefined"),
            ("(b: Z | Y) => D | C", "(b:Y | Z)=>C | D"),
            ("((a: B | A) => void) | A", "((a:A | B)=>void) | A"),
            ("{ b: Y | X; a?: \"q\" | \"p\";}", "{a?:\"p\" | \"q\";b:X | Y;}"),
            ("[B | A, D | C][]", "[A | B,C | D][]"),
            ("T extends B | A ? D | C : F | E", "T extends A | B?C | D:E | F"),
            ("(x: unknown) => x is B | A", "(x:unknown)=>x is A | B"),
            ("{ [K in \"b\" | \"a\"]: K;}", "{[K in \"a\" | \"b\"]:K;}"),
            ("\"x | a\" | \"a\"", "\"a\" | \"x | a\""),
            ("`b${string}` | `a|${string}`", "`a|${string}` | `b${string}`"),
            ("\"\\\"|z\" | B", "\"\\\"|z\" | B"),
            ("é | Z | a", "Z | a | é"),
            ("B) | A", "B) | A"),
            ("{ z: { d: 1; c: 2; }; (a: Q): R; a: 1; }[]", "{(a:Q):R;a:1;z:{c:2;d:1;};}[]"),
            ("a; b", "a;b"),
            ("`id-${string & { k: \"z\" | \"a\"; }}` | A", "A | `id-${string & {k:\"a\" | \"z\";}}`"),
            ("`p${B | A}q${D | C}` | `a`", "`a` | `p${A | B}q${C | D}`"),
            ("`\\u00E9\\uD83D\\uDE00\\uD800\\u0041\\\\u00E9${string}`", "`\u{e9}\u{1f600}\\uD800\\u0041\\\\u00E9${string}`"),
            ("`a${`b${Z | Y}`}`", "`a${`b${Y | Z}`}`"),
        ];
        for (written, expected) in cases {
            assert_eq!(with_sorted_unions(written), expected, "{written}");
        }
    }
}
