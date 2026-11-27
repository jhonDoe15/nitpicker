//! The format specifier grammar of `java.util.Formatter` and the checks it makes on each specifier while parsing.
use super::{Failure, Flags, Spec};

const FLAG_CHARS: &str = "-#+ 0,(<";
const DATE_CONVERSIONS: &str = "HIklMSLNpzZsQBbhAaCYyjmdeRTrDFc";
const CONVERSIONS: &str = "bBhHsScCdoxXeEfgGaAn%";
const UPPER: &str = "BHSCXEGAT";

fn digits(chars: &[char], at: usize) -> usize {
    chars[at..].iter().take_while(|c| c.is_ascii_digit()).count()
}

fn number(chars: &[char]) -> Option<i32> {
    chars.iter().collect::<String>().parse().ok()
}

struct Matched {
    start: usize,
    index: Option<(usize, usize)>,
    flags: (usize, usize),
    width: Option<(usize, usize)>,
    precision: Option<(usize, usize)>,
    date: bool,
    conversion: usize,
}

fn match_at(chars: &[char], start: usize) -> Option<Matched> {
    let mut at = start;
    let leading = digits(chars, at);
    let index = (leading > 0 && chars.get(at + leading) == Some(&'$')).then(|| (at, at + leading));
    if let Some((_, end)) = index {
        at = end + 1;
    }
    let flag_start = at;
    while chars.get(at).is_some_and(|c| FLAG_CHARS.contains(*c)) {
        at += 1;
    }
    let flags = (flag_start, at);
    let count = digits(chars, at);
    let width = (count > 0).then(|| (at, at + count));
    at += count;
    let mut precision = None;
    if chars.get(at) == Some(&'.') {
        let count = digits(chars, at + 1);
        if count == 0 {
            return None;
        }
        precision = Some((at + 1, at + 1 + count));
        at += 1 + count;
    }
    let letter = |c: Option<&char>| c.is_some_and(|c| c.is_ascii_alphabetic() || *c == '%');
    let date = matches!(chars.get(at), Some('t' | 'T')) && letter(chars.get(at + 1));
    let conversion = if date { at + 1 } else { at };
    letter(chars.get(conversion)).then_some(Matched { start, index, flags, width, precision, date, conversion })
}

fn bad(spec: &Spec, flags: Flags) -> Result<(), Failure> {
    let found = spec.flags.0 & flags.0;
    if found == 0 { Ok(()) } else { Err(Failure::Mismatch(Flags(found), spec.conversion)) }
}

fn missing_width(spec: &Spec, flags: Flags) -> Result<(), Failure> {
    if spec.width == -1 && spec.flags.0 & flags.0 != 0 { Err(Failure::MissingWidth(spec.text())) } else { Ok(()) }
}

fn no_precision(spec: &Spec) -> Result<(), Failure> {
    if spec.precision != -1 { Err(Failure::Precision(spec.precision)) } else { Ok(()) }
}

fn numeric(spec: &Spec) -> Result<(), Failure> {
    missing_width(spec, Flags::LEFT.with(Flags::ZERO))?;
    let both = |a: Flags, b: Flags| spec.flags.has(a) && spec.flags.has(b);
    if both(Flags::PLUS, Flags::SPACE) || both(Flags::LEFT, Flags::ZERO) {
        return Err(Failure::IllegalFlags(spec.flags));
    }
    Ok(())
}

fn check(spec: &Spec) -> Result<(), Failure> {
    let others = Flags::PLUS.with(Flags::SPACE).with(Flags::ZERO).with(Flags::GROUP).with(Flags::PARENTHESES);
    if spec.date {
        no_precision(spec)?;
        if !DATE_CONVERSIONS.contains(spec.conversion) {
            return Err(Failure::Unknown(format!("t{}", spec.conversion)));
        }
        bad(spec, others.with(Flags::ALTERNATE))?;
        return missing_width(spec, Flags::LEFT);
    }
    match spec.conversion {
        'b' | 'h' | 's' => {
            if spec.conversion != 's' {
                bad(spec, Flags::ALTERNATE)?;
            }
            missing_width(spec, Flags::LEFT)?;
            bad(spec, others)
        }
        'c' => {
            no_precision(spec)?;
            bad(spec, others.with(Flags::ALTERNATE))?;
            missing_width(spec, Flags::LEFT)
        }
        'd' | 'o' | 'x' => {
            numeric(spec)?;
            no_precision(spec)?;
            bad(spec, if spec.conversion == 'd' { Flags::ALTERNATE } else { Flags::GROUP })
        }
        'e' | 'f' | 'g' | 'a' => {
            numeric(spec)?;
            match spec.conversion {
                'a' => bad(spec, Flags::PARENTHESES.with(Flags::GROUP)),
                'e' => bad(spec, Flags::GROUP),
                'g' => bad(spec, Flags::ALTERNATE),
                _ => Ok(()),
            }
        }
        '%' => {
            no_precision(spec)?;
            if spec.flags.0 & !Flags::LEFT.0 != 0 {
                return Err(Failure::IllegalFlags(spec.flags));
            }
            missing_width(spec, Flags::LEFT).map_err(|_| Failure::MissingWidth("%-%".into()))
        }
        _ => {
            no_precision(spec)?;
            if spec.width != -1 {
                return Err(Failure::Width(spec.width));
            }
            if spec.flags.0 != 0 { Err(Failure::IllegalFlags(spec.flags)) } else { Ok(()) }
        }
    }
}

fn build(chars: &[char], matched: &Matched, jdk: u32) -> Result<Spec, Failure> {
    let mut spec = Spec { index: 0, flags: Flags(0), width: -1, precision: -1, date: matched.date, conversion: ' ' };
    if let Some((start, end)) = matched.index {
        spec.index = number(&chars[start..end]).ok_or(Failure::Other("Format argument index: (not representable as int)".into()))?;
        if spec.index == 0 {
            return Err(Failure::Other("Illegal format argument index = 0".into()));
        }
    }
    for &c in &chars[matched.flags.0..matched.flags.1] {
        let flag = Flags::of(c);
        if spec.flags.has(flag) {
            return Err(Failure::Duplicate(flag));
        }
        spec.flags = spec.flags.with(flag);
    }
    if spec.flags.has(Flags::PREVIOUS) {
        spec.index = -1;
    }
    if let Some((start, end)) = matched.width {
        spec.width = number(&chars[start..end]).unwrap_or(i32::MIN);
        if spec.width == i32::MIN {
            return Err(Failure::Width(i32::MIN));
        }
    }
    if let Some((start, end)) = matched.precision {
        spec.precision = number(&chars[start..end]).unwrap_or(i32::MIN);
        if spec.precision == i32::MIN {
            return Err(Failure::Precision(i32::MIN));
        }
    }
    let conversion = chars[matched.conversion];
    if matched.date {
        if chars[matched.conversion - 1] == 'T' {
            spec.flags = spec.flags.with(Flags::UPPER);
        }
        spec.conversion = conversion;
    } else {
        if !CONVERSIONS.contains(conversion) {
            let dangling = matches!(conversion, 't' | 'T') && matched.conversion > matched.start && matched.conversion + 1 < chars.len();
            return Err(Failure::Unknown(if dangling && jdk >= 23 { "\0".into() } else { conversion.to_string() }));
        }
        if UPPER.contains(conversion) {
            spec.flags = spec.flags.with(Flags::UPPER);
        }
        spec.conversion = conversion.to_ascii_lowercase();
    }
    check(&spec)?;
    Ok(spec)
}

/// The first UTF-16 unit of a character as the JDK reports it; a lone high surrogate cannot be written, so `?` stands
/// for it, as it does when the JDK writes that text out.
fn unit_text(c: char) -> String {
    if u32::from(c) > 0xFFFF { "?".into() } else { c.to_string() }
}

/// The specifiers of a format string in order, or the failure the parse throws first.
pub fn specifiers(text: &str, jdk: u32) -> Result<Vec<Spec>, Failure> {
    let chars: Vec<char> = text.chars().collect();
    let mut found = Vec::new();
    let mut at = 0;
    while let Some(offset) = chars[at..].iter().position(|c| *c == '%') {
        let start = at + offset + 1;
        let Some(&next) = chars.get(start) else { return Err(Failure::Unknown("%".into())) };
        let Some(matched) = match_at(&chars, start) else { return Err(Failure::Unknown(unit_text(next))) };
        found.push(build(&chars, &matched, jdk)?);
        at = matched.conversion + 1;
    }
    Ok(found)
}
