//! What `DateTimeFormatter.parse` does after the text matched: resolving the parsed fields and the `from` method of the
//! requested type, with the JDK's messages.
use super::format::{Field, Parsed, Zone};
use super::instant::month_length;

const MONTHS: [&str; 12] =
    ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

fn name(field: Field) -> &'static str {
    match field {
        Field::Year => "Year",
        Field::Month => "MonthOfYear",
        Field::Day => "DayOfMonth",
        Field::Hour => "HourOfDay",
        Field::Minute => "MinuteOfHour",
        Field::Second => "SecondOfMinute",
        Field::Nano => "NanoOfSecond",
        Field::Offset => "OffsetSeconds",
        Field::InstantSeconds => "InstantSeconds",
        Field::Micro => "MicroOfSecond",
        Field::Milli => "MilliOfSecond",
    }
}

fn range(field: Field) -> (i64, i64, &'static str) {
    match field {
        Field::Year => (-999_999_999, 999_999_999, "-999999999 - 999999999"),
        Field::Month => (1, 12, "1 - 12"),
        Field::Day => (1, 31, "1 - 28/31"),
        Field::Hour => (0, 23, "0 - 23"),
        Field::Minute | Field::Second => (0, 59, "0 - 59"),
        _ => (0, 999_999_999, "0 - 999999999"),
    }
}

pub fn check(field: Field, value: i64) -> Result<i64, String> {
    let (low, high, text) = range(field);
    if value < low || value > high {
        return Err(format!("Invalid value for {} (valid values {text}): {value}", name(field)));
    }
    Ok(value)
}

pub fn date(year: i64, month: i64, day: i64) -> Result<(), String> {
    if day > 28 && day > month_length(year, month) {
        if day == 29 {
            return Err(format!("Invalid date 'February 29' as '{year}' is not a leap year"));
        }
        return Err(format!("Invalid date '{} {day}'", MONTHS[month as usize - 1]));
    }
    Ok(())
}

/// The fields of a parse as `Parsed.toString` lists them; the JDK keeps them in a hash map keyed by identity hash codes,
/// so the order is the one seen on a fresh JVM.
pub fn shown(parsed: &Parsed, order: &[Field], resolved: Option<String>) -> String {
    let mut fields: Vec<&(Field, i64)> = parsed.fields.iter().collect();
    fields.sort_by_key(|(field, _)| order.iter().position(|known| known == field).unwrap_or(order.len()));
    let listed: Vec<String> = fields.iter().map(|(field, value)| format!("{}={value}", name(*field))).collect();
    let tail = resolved.map(|text| format!(" resolved to {text}")).unwrap_or_default();
    format!("{{{}}},ISO{tail}", listed.join(", "))
}

fn time_text(hour: i64, minute: i64, second: i64, nano: i64) -> String {
    let mut text = format!("{hour:02}:{minute:02}");
    if second > 0 || nano > 0 {
        text += &format!(":{second:02}");
        if nano > 0 {
            if nano % 1_000_000 == 0 {
                text += &format!(".{:03}", nano / 1_000_000);
            } else if nano % 1000 == 0 {
                text += &format!(".{:06}", nano / 1000);
            } else {
                text += &format!(".{nano:09}");
            }
        }
    }
    text
}

/// The ISO formats resolve strictly: the date first, then the time (minute and nano before hour and second), then the
/// offset of a date and time. Answers the fields left and the resolved time.
pub fn strict(mut parsed: Parsed) -> Result<(Parsed, Option<String>), String> {
    let date_fields = [Field::Year, Field::Month, Field::Day];
    let has_date = date_fields.iter().all(|field| parsed.get(*field).is_some());
    if has_date {
        let [year, month, day] = date_fields.map(|field| parsed.remove(field).unwrap_or(0));
        date(check(Field::Year, year)?, check(Field::Month, month)?, check(Field::Day, day)?)?;
    }
    let mut time = None;
    if parsed.get(Field::Hour).is_some() {
        let [hour, minute, second, nano] =
            [Field::Hour, Field::Minute, Field::Second, Field::Nano].map(|field| parsed.remove(field).unwrap_or(0));
        let (minute, nano) = (check(Field::Minute, minute)?, check(Field::Nano, nano)?);
        time = Some(time_text(check(Field::Hour, hour)?, minute, check(Field::Second, second)?, nano));
    }
    if let (true, Some(offset)) = (has_date && time.is_some(), parsed.get(Field::Offset)) {
        offset_check(offset)?;
    }
    Ok((parsed, time))
}

pub fn offset_check(offset: i64) -> Result<(), String> {
    if offset.abs() > 18 * 3600 {
        return Err("Zone offset not in valid range: -18:00 to +18:00".into());
    }
    Ok(())
}

pub fn zone_offset(parsed: &Parsed) -> Option<i64> {
    parsed.get(Field::Offset).or(match parsed.zone {
        Some(Zone::Offset(seconds)) => Some(seconds),
        _ => None,
    })
}
