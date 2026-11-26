//! `shared/naming/time-units`: which unit a name carries, and the words the messages are made of.

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Unit {
    Ns,
    Us,
    Ms,
    S,
    Min,
}

const ALL: [Unit; 5] = [Unit::Ns, Unit::Us, Unit::Ms, Unit::S, Unit::Min];

impl Unit {
    pub fn scale(self) -> f64 {
        match self {
            Unit::Ns => 1.0,
            Unit::Us => 1e3,
            Unit::Ms => 1e6,
            Unit::S => 1e9,
            Unit::Min => 6e10,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Unit::Ns => "nanoseconds",
            Unit::Us => "microseconds",
            Unit::Ms => "milliseconds",
            Unit::S => "seconds",
            Unit::Min => "minutes",
        }
    }
}

const UNIT_WORDS: [(&str, Unit); 12] = [
    ("Nanoseconds", Unit::Ns),
    ("Nanos", Unit::Ns),
    ("Microseconds", Unit::Us),
    ("Micros", Unit::Us),
    ("Milliseconds", Unit::Ms),
    ("Millis", Unit::Ms),
    ("Ms", Unit::Ms),
    ("Seconds", Unit::S),
    ("Secs", Unit::S),
    ("Minutes", Unit::Min),
    ("EpochMilli", Unit::Ms),
    ("EpochSecond", Unit::S),
];

const CONVERTER_PREFIXES: [&str; 14] = [
    "of", "plus", "minus", "with", "set", "from", "parse", "sleep", "truncated", "multiplied", "divided", "is", "has",
    "format",
];
const FLAG_WORDS: [&str; 10] =
    ["show", "hide", "include", "display", "enable", "disable", "use", "should", "can", "allow"];

fn is_upper_or_underscore(next: Option<char>) -> bool {
    next.is_none_or(|c| c.is_ascii_uppercase() || c == '_')
}

fn is_ratio(name: &str) -> bool {
    ["Per", "_per", "_PER"].iter().any(|pattern| {
        name.match_indices(pattern).any(|(at, _)| is_upper_or_underscore(name[at + pattern.len()..].chars().next()))
    })
}

fn is_flag(name: &str) -> bool {
    let rest = name.trim_start_matches('_');
    FLAG_WORDS.iter().any(|word| {
        let after = rest.strip_prefix(word);
        after.is_some_and(|after| after.chars().next().is_some_and(|c| c.is_ascii_uppercase() || c == '_'))
    })
}

fn snake_unit(name: &str, word: &str, unit: Unit) -> Option<Unit> {
    let lower = word.to_ascii_lowercase();
    let snake = match lower.strip_prefix("epoch") {
        Some(rest) if !rest.is_empty() => format!("epoch_{rest}"),
        _ => lower,
    };
    let forms = [format!("_{snake}"), format!("_{}", snake.to_ascii_uppercase())];
    forms.iter().any(|form| name.ends_with(form.as_str())).then_some(unit)
}

fn word_unit(name: &str, word: &str, unit: Unit) -> Option<Unit> {
    let bare = name.trim_start_matches('_');
    let mut letters = word.chars();
    let first = letters.next().map(|c| c.to_ascii_lowercase()).unwrap_or_default();
    let lower_first = format!("{first}{}", letters.as_str());
    if bare == word.to_ascii_lowercase() || bare == word.to_ascii_uppercase() || bare == lower_first {
        return Some(unit);
    }
    if let Some(head) = name.strip_suffix(word)
        && head.chars().last().is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
    {
        return Some(unit);
    }
    snake_unit(name, word, unit)
}

pub fn unit_of_name(name: &str) -> Option<Unit> {
    if name.is_empty() || is_ratio(name) || is_flag(name) {
        return None;
    }
    UNIT_WORDS.iter().find_map(|(word, unit)| word_unit(name, word, *unit))
}

pub fn is_epoch_name(name: &str) -> bool {
    name.to_lowercase().contains("epoch")
}

fn starts_with_converter(name: &str) -> bool {
    CONVERTER_PREFIXES.iter().any(|prefix| {
        name.strip_prefix(prefix).is_some_and(|rest| !rest.chars().next().is_some_and(|c| c.is_ascii_lowercase()))
    })
}

pub fn unit_of_call_name(name: &str) -> Option<Unit> {
    if starts_with_converter(name) { None } else { unit_of_name(name) }
}

pub fn argument_unit_of_call_name(name: &str) -> Option<Unit> {
    if starts_with_converter(name) { unit_of_name(name) } else { None }
}

/// The unit a value of `unit` becomes when it is multiplied or divided by `factor`.
pub fn converted_unit(unit: Unit, factor: f64, operator: &str) -> Option<Unit> {
    if !factor.is_finite() || factor <= 0.0 {
        return None;
    }
    let target = if operator == "*" { unit.scale() / factor } else { unit.scale() * factor };
    ALL.into_iter().find(|candidate| candidate.scale() == target)
}

pub fn unit_factor(from: Unit, to: Unit) -> f64 {
    let ratio = from.scale() / to.scale();
    if ratio >= 1.0 { ratio } else { 1.0 / ratio }
}

pub fn is_js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}'
            | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'
    )
}

pub fn conversion_example(value: &str, from: Unit, to: Unit) -> String {
    let factor = unit_factor(from, to);
    let operand = if value.chars().any(is_js_space) { format!("({value})") } else { value.to_string() };
    if from.scale() > to.scale() { format!("{operand} * {factor}") } else { format!("{operand} / {factor}") }
}
