//! `String.format(Locale.ROOT, "%.2g", value)` for powers of two, from their exact decimal digits.

fn round_half_up(digits: &[u8], keep: usize) -> (Vec<u8>, bool) {
    let mut kept: Vec<u8> = digits.iter().copied().chain(std::iter::repeat(0)).take(keep).collect();
    if digits.get(keep).is_some_and(|digit| *digit >= 5) {
        let mut at = keep;
        loop {
            if at == 0 {
                kept.insert(0, 1);
                kept.truncate(keep);
                return (kept, true);
            }
            at -= 1;
            if kept[at] == 9 {
                kept[at] = 0;
            } else {
                kept[at] += 1;
                return (kept, false);
            }
        }
    }
    (kept, false)
}

fn times(digits: &mut Vec<u8>, factor: u8) {
    let mut carry = 0u16;
    for digit in digits.iter_mut().rev() {
        let product = u16::from(*digit) * u16::from(factor) + carry;
        *digit = (product % 10) as u8;
        carry = product / 10;
    }
    while carry > 0 {
        digits.insert(0, (carry % 10) as u8);
        carry /= 10;
    }
}

/// The decimal digits of two to the power, and the exponent of its first digit.
fn power_digits(power: i32) -> (Vec<u8>, i32) {
    let mut digits = vec![1];
    for _ in 0..power.unsigned_abs() {
        times(&mut digits, if power < 0 { 5 } else { 2 });
    }
    let exponent = digits.len() as i32 - 1 + power.min(0);
    (digits, exponent)
}

/// The text of `%.2g` for two to the power, as `java.util.Formatter` writes it with `Locale.ROOT`.
pub fn general_two_digits(power: i32) -> String {
    let (digits, exponent) = power_digits(power);
    let (kept, carried) = round_half_up(&digits, 2);
    let exponent = exponent + i32::from(carried);
    let text: String = kept.iter().map(|digit| char::from(b'0' + digit)).collect();
    match exponent {
        0 => format!("{}.{}", &text[..1], &text[1..]),
        1 => text,
        -4..=-1 => format!("0.{}{text}", "0".repeat((-exponent - 1) as usize)),
        _ => format!("{}.{}e{}{:02}", &text[..1], &text[1..], if exponent < 0 { '-' } else { '+' }, exponent.abs()),
    }
}
