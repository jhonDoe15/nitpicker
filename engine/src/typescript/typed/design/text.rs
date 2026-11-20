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
        if matches!(character, '"' | '\'' | '`') {
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
        ];
        for (written, expected) in cases {
            assert_eq!(with_sorted_unions(written), expected, "{written}");
        }
    }
}
