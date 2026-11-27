//! Models of the JDK parsers that Error Prone's AlwaysThrows calls with constant arguments, so the engine gives the
//! exception the call throws without running the JDK.
#[cfg(test)]
mod cases;
mod format;
mod instant;
mod offset;
mod resolve;

use super::jdk_values;
pub use format::digit;
use format::{Ctx, El, Field, Parsed, Sign};
use resolve::{check, offset_check, shown, strict, zone_offset};

const TWO: Sign = Sign::NotNegative;
const LOCAL_DATE: &[El] = &[
    El::Value(Field::Year, 4, 10, Sign::ExceedsPad),
    El::Lit(b'-'),
    El::Value(Field::Month, 2, 2, TWO),
    El::Lit(b'-'),
    El::Value(Field::Day, 2, 2, TWO),
];
const FRACTION: &[El] = &[El::Fraction];
const SECONDS: &[El] = &[El::Lit(b':'), El::Value(Field::Second, 2, 2, TWO), El::Opt(FRACTION)];
const LOCAL_TIME: &[El] = &[El::Value(Field::Hour, 2, 2, TWO), El::Lit(b':'), El::Value(Field::Minute, 2, 2, TWO), El::Opt(SECONDS)];
const LOCAL_DATE_TIME: &[El] = &[El::Insensitive, El::Seq(LOCAL_DATE), El::Lit(b'T'), El::Seq(LOCAL_TIME)];
const OFFSET_DATE_TIME: &[El] = &[El::Insensitive, El::Seq(LOCAL_DATE_TIME), El::Lenient, El::Offset, El::Strict];
const REGION: &[El] = &[El::Lit(b'['), El::Sensitive, El::Region, El::Lit(b']')];
const ZONED_DATE_TIME: &[El] = &[El::Seq(OFFSET_DATE_TIME), El::Opt(REGION)];
const OFFSET_TIME: &[El] = &[El::Insensitive, El::Seq(LOCAL_TIME), El::Offset];
const OFFSET_TIME_27: &[El] = &[El::Insensitive, El::Seq(LOCAL_TIME), El::Lenient, El::Offset, El::Strict];
const INSTANT: &[El] = &[El::Insensitive, El::Instant];
const YEAR: &[El] = &[El::Lenient, El::Value(Field::Year, 1, 10, Sign::ExceedsPad)];
const YEAR_MONTH: &[El] = &[El::Value(Field::Year, 4, 10, Sign::ExceedsPad), El::Lit(b'-'), El::Value(Field::Month, 2, 2, TWO)];
const MONTH_DAY: &[El] =
    &[El::Text(b"--"), El::Value(Field::Month, 2, 2, TWO), El::Lit(b'-'), El::Value(Field::Day, 2, 2, TWO)];

fn quoted(text: &[u16]) -> String {
    if text.len() > 64 { format!("{}...", String::from_utf16_lossy(&text[..64])) } else { String::from_utf16_lossy(text) }
}

/// `DateTimeFormatter.parseResolved0` up to the resolving: the parsed fields, or the exception's message.
fn unresolved(elements: &[El], text: &[u16], jdk: u32) -> Result<Parsed, String> {
    let mut ctx = Ctx::new(jdk);
    let fail = |message: String| format!("Text '{}' could not be parsed{message}", quoted(text));
    let end = format::parse(&mut ctx, elements, text, 0).map_err(|message| fail(format!(": {message}")))?;
    if end < 0 {
        return Err(fail(format!(" at index {}", !end)));
    }
    if (end as usize) < text.len() {
        return Err(fail(format!(", unparsed text found at index {end}")));
    }
    Ok(ctx.parsed.pop().expect("parsed"))
}

fn unable(kind: &str, parsed: &Parsed, order: &[Field], resolved: Option<String>) -> String {
    format!("Unable to obtain {kind} from TemporalAccessor: {} of type java.time.format.Parsed", shown(parsed, order, resolved))
}

fn formatted(kind: &str, text: &[u16], jdk: u32) -> Result<(), String> {
    let elements = match kind {
        "Instant" => INSTANT,
        "LocalDate" => LOCAL_DATE,
        "LocalDateTime" => LOCAL_DATE_TIME,
        "LocalTime" => LOCAL_TIME,
        "MonthDay" => MONTH_DAY,
        "OffsetDateTime" => OFFSET_DATE_TIME,
        "OffsetTime" if jdk >= 27 => OFFSET_TIME_27,
        "OffsetTime" => OFFSET_TIME,
        "Year" => YEAR,
        "YearMonth" => YEAR_MONTH,
        _ => ZONED_DATE_TIME,
    };
    let parsed = unresolved(elements, text, jdk)?;
    let fail = |message: String| format!("Text '{}' could not be parsed: {message}", quoted(text));
    match kind {
        "Year" => Ok(()),
        "MonthDay" => {
            let (month, day) = (parsed.get(Field::Month).unwrap_or(0), parsed.get(Field::Day).unwrap_or(0));
            let valid = (1..=12).contains(&month) && day >= 1 && day <= instant::month_length(2000, month);
            if valid { Ok(()) } else { Err(fail(unable("MonthDay", &parsed, &[Field::Month, Field::Day], None))) }
        }
        "YearMonth" => {
            let valid = check(Field::Year, parsed.get(Field::Year).unwrap_or(0)).is_ok()
                && check(Field::Month, parsed.get(Field::Month).unwrap_or(0)).is_ok();
            let order = [Field::Year, Field::Month];
            if valid { Ok(()) } else { Err(fail(unable("YearMonth", &parsed, &order, None))) }
        }
        "Instant" => {
            let seconds = parsed.get(Field::InstantSeconds).unwrap_or(0);
            if (-31_557_014_167_219_200..=31_556_889_864_403_199).contains(&seconds) {
                return Ok(());
            }
            let mut shown_fields = parsed.clone();
            let nano = parsed.get(Field::Nano).unwrap_or(0);
            shown_fields.put(Field::Micro, nano / 1000);
            shown_fields.put(Field::Milli, nano / 1_000_000);
            let order = [Field::InstantSeconds, Field::Nano, Field::Micro, Field::Milli];
            Err(fail(unable("Instant", &shown_fields, &order, None)))
        }
        _ => {
            let (rest, time) = strict(parsed).map_err(fail)?;
            if kind == "OffsetTime" {
                let offset = zone_offset(&rest).unwrap_or(0);
                if offset_check(offset).is_err() {
                    return Err(fail(unable("OffsetTime", &rest, &[Field::Offset], time)));
                }
            }
            Ok(())
        }
    }
}

/// The exception `Class: message` that the parser of the type throws for the text, or `None` when it parses.
pub fn failure(kind: &str, text: &str, jdk: u32) -> Option<String> {
    let units: Vec<u16> = text.encode_utf16().collect();
    match kind {
        "Duration" => jdk_values::duration(&units),
        "Period" => jdk_values::period(&units),
        "UUID" => jdk_values::uuid(&units, jdk),
        "ByteString" => jdk_values::hex(&units),
        _ => formatted(kind, &units, jdk).err().map(|message| format!("DateTimeParseException: {message}")),
    }
}
