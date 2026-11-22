//! `INTEGER_LITERAL` and `FLOATING_POINT_LITERAL` of PMD's Java grammar, as the longest match JavaCC takes. Each
//! part gives every offset its pattern can end at, so the alternatives combine like the grammar's.
use super::lexer::Kind;

type Ends = Vec<usize>;

fn byte(text: &[u16], at: usize) -> Option<u8> {
    text.get(at).and_then(|&unit| u8::try_from(unit).ok())
}

fn one(text: &[u16], at: usize, accept: impl Fn(u8) -> bool) -> Ends {
    if byte(text, at).is_some_and(accept) { vec![at + 1] } else { Vec::new() }
}

fn then(ends: Ends, part: impl Fn(usize) -> Ends) -> Ends {
    ends.into_iter().flat_map(part).collect()
}

fn optional(ends: Ends, part: impl Fn(usize) -> Ends) -> Ends {
    let mut all = ends.clone();
    all.extend(then(ends, part));
    all
}

/// `first (("_")* digit)*`: every offset after a digit of the run.
fn run(text: &[u16], at: usize, first: impl Fn(u8) -> bool, digit: impl Fn(u8) -> bool) -> Ends {
    if !byte(text, at).is_some_and(first) {
        return Vec::new();
    }
    let mut ends = vec![at + 1];
    let mut end = at + 1;
    loop {
        let mut next = end;
        while byte(text, next) == Some(b'_') {
            next += 1;
        }
        if !byte(text, next).is_some_and(&digit) {
            return ends;
        }
        end = next + 1;
        ends.push(end);
    }
}

fn decimal(byte: u8) -> bool {
    byte.is_ascii_digit()
}

fn digits(text: &[u16], at: usize) -> Ends {
    run(text, at, decimal, decimal)
}

fn hex_digits(text: &[u16], at: usize) -> Ends {
    run(text, at, |byte| byte.is_ascii_hexdigit(), |byte| byte.is_ascii_hexdigit())
}

fn any_of(set: &'static [u8]) -> impl Fn(u8) -> bool {
    move |byte| set.contains(&byte)
}

fn exponent(text: &[u16], at: usize, letters: &'static [u8]) -> Ends {
    let sign = optional(one(text, at, any_of(letters)), |end| one(text, end, any_of(b"+-")));
    then(sign, |end| digits(text, end))
}

fn float_suffix(text: &[u16], ends: Ends) -> Ends {
    optional(ends, |end| one(text, end, any_of(b"fFdD")))
}

fn hex_start(text: &[u16], at: usize) -> Ends {
    then(one(text, at, |byte| byte == b'0'), |end| one(text, end, any_of(b"xX")))
}

fn integer(text: &[u16], at: usize) -> Ends {
    let mut numerals = run(text, at, |byte| (b'1'..=b'9').contains(&byte), decimal);
    numerals.extend(then(hex_start(text, at), |end| hex_digits(text, end)));
    let binary = then(one(text, at, |byte| byte == b'0'), |end| one(text, end, any_of(b"bB")));
    numerals.extend(then(binary, |end| run(text, end, any_of(b"01"), any_of(b"01"))));
    numerals.extend(run(text, at, |byte| byte == b'0', any_of(b"01234567")));
    optional(numerals, |end| one(text, end, any_of(b"lL")))
}

fn float(text: &[u16], at: usize) -> Ends {
    let dot = |end: usize| one(text, end, |byte| byte == b'.');
    let exp = |end: usize| exponent(text, end, b"eE");
    let with_dot = then(then(digits(text, at), dot), |end| optional(vec![end], |end| digits(text, end)));
    let mut all = float_suffix(text, optional(with_dot, exp));
    let leading_dot = then(dot(at), |end| digits(text, end));
    all.extend(float_suffix(text, optional(leading_dot, exp)));
    all.extend(float_suffix(text, then(digits(text, at), exp)));
    all.extend(then(optional(digits(text, at), exp), |end| one(text, end, any_of(b"fFdD"))));
    let hex_exp = |end: usize| exponent(text, end, b"pP");
    let hex_whole = then(hex_start(text, at), |end| hex_digits(text, end));
    all.extend(float_suffix(text, then(optional(hex_whole, dot), hex_exp)));
    let hex_fraction = then(optional(hex_start(text, at), |end| hex_digits(text, end)), dot);
    all.extend(float_suffix(text, then(then(hex_fraction, |end| hex_digits(text, end)), hex_exp)));
    all
}

/// The number literal at `at` and its length, integer first on a tie as the grammar lists it first.
pub fn literal(text: &[u16], at: usize) -> Option<(Kind, usize)> {
    let start = byte(text, at)?;
    if !start.is_ascii_digit() && start != b'.' {
        return None;
    }
    let longest = |ends: Ends| ends.into_iter().max().map(|end| end - at);
    let whole = longest(integer(text, at));
    let fraction = longest(float(text, at));
    match (whole, fraction) {
        (Some(whole), Some(fraction)) if fraction > whole => Some((Kind::Float, fraction)),
        (Some(whole), _) => Some((Kind::Integer, whole)),
        (None, Some(fraction)) => Some((Kind::Float, fraction)),
        (None, None) => None,
    }
}
