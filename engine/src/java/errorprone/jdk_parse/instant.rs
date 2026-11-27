//! `appendInstant()` as `Instant.parse` uses it: an ISO date and time with an offset, turned into epoch seconds.
use super::format::{Ctx, El, Field, Sign, parse};

const DATE: &[El] = &[
    El::Value(Field::Year, 4, 10, Sign::ExceedsPad),
    El::Lit(b'-'),
    El::Value(Field::Month, 2, 2, Sign::NotNegative),
    El::Lit(b'-'),
    El::Value(Field::Day, 2, 2, Sign::NotNegative),
];

const INSTANT: &[El] = &[El::Seq(DATE_TIME), El::Offset];
const INSTANT_26: &[El] = &[El::Seq(DATE_TIME), El::Lenient, El::OffsetHours];
const DATE_TIME: &[El] = &[
    El::Seq(DATE),
    El::Lit(b'T'),
    El::Value(Field::Hour, 2, 2, Sign::NotNegative),
    El::Lit(b':'),
    El::Value(Field::Minute, 2, 2, Sign::NotNegative),
    El::Lit(b':'),
    El::Value(Field::Second, 2, 2, Sign::NotNegative),
    El::Fraction,
];

const SECONDS_PER_10000_YEARS: i64 = 146_097 * 25 * 86_400;

pub fn month_length(year: i64, month: i64) -> i64 {
    match month {
        2 if leap(year) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

pub fn leap(year: i64) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

/// Days from 1970-01-01, for a valid date.
pub fn epoch_day(year: i64, month: i64, day: i64) -> i64 {
    let mut total = 365 * year;
    if year >= 0 {
        total += (year + 3) / 4 - (year + 99) / 100 + (year + 399) / 400;
    } else {
        total -= year / -4 - year / -100 + year / -400;
    }
    total += (367 * month - 362) / 12;
    total += day - 1;
    if month > 2 {
        total -= 1;
        if !leap(year) {
            total -= 1;
        }
    }
    total - 719_528
}

fn epoch_seconds(year: i64, month: i64, day: i64, hour: i64, minute: i64, second: i64, plus_day: i64, offset: i64) -> Option<i64> {
    if !(1..=12).contains(&month) || day < 1 || day > month_length(year, month) || hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    if offset.abs() > 18 * 3600 {
        return None;
    }
    let days = epoch_day(year, month, day) + plus_day;
    Some(days * 86_400 + hour * 3600 + minute * 60 + second - offset)
}

pub fn instant(ctx: &mut Ctx, text: &[u16], position: usize) -> Result<isize, String> {
    let mut inner = ctx.copy();
    let end = parse(&mut inner, if ctx.jdk >= 26 { INSTANT_26 } else { INSTANT }, text, position)?;
    if end < 0 {
        return Ok(end);
    }
    let parsed = inner.current();
    let get = |field| parsed.get(field).unwrap_or(0);
    let year_parsed = get(Field::Year);
    let (month, day, mut hour, minute) = (get(Field::Month), get(Field::Day), get(Field::Hour), get(Field::Minute));
    let (mut second, nano, offset) = (get(Field::Second), get(Field::Nano), get(Field::Offset));
    let mut days = 0;
    if hour == 24 && minute == 0 && second == 0 && nano == 0 {
        hour = 0;
        days = 1;
    } else if hour == 23 && minute == 59 && second == 60 {
        second = 59;
    }
    let year = i64::from((year_parsed as i32) % 10_000);
    let Some(mut seconds) = epoch_seconds(year, month, day, hour, minute, second, days, offset) else {
        return Ok(!(position as isize));
    };
    let Some(shift) = (year_parsed / 10_000).checked_mul(SECONDS_PER_10000_YEARS) else {
        return Ok(!(position as isize));
    };
    seconds = seconds.wrapping_add(shift);
    let success = ctx.set(Field::InstantSeconds, seconds, position, end as usize);
    Ok(if success < 0 { success } else { ctx.set(Field::Nano, nano, position, success as usize) })
}
