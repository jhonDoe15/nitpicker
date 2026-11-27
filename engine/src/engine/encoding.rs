//! The character sets javac reads sources in (`-encoding`), for the ones whose decoding is known to be the JDK's.
//! Each listed set decodes every byte sequence the JDK 21 decoder accepts to the same characters (checked against
//! `java.nio.charset` for every one- and two-byte sequence); a byte the JDK rejects stops javac, so its decoding here
//! does not matter. The names are the JDK's names and aliases for the set, compared without case.
use encoding_rs::Encoding;

#[derive(Clone, Copy)]
pub enum Charset {
    /// ISO-8859-1: each byte is the character with that number.
    Latin1,
    /// US-ASCII: only bytes below 0x80 are characters.
    Ascii,
    Table(&'static Encoding),
}

const UTF_8: &[&str] = &["UTF-8", "UTF8", "unicode-1-1-utf-8"];

const SETS: &[(&[&str], Charset)] = &[
    (&["ISO-8859-1", "819", "8859_1", "IBM-819", "IBM819", "ISO8859-1", "ISO8859_1", "ISO_8859-1", "ISO_8859-1:1987", "ISO_8859_1", "cp819", "csISOLatin1", "iso-ir-100", "l1", "latin1"], Charset::Latin1),
    (&["US-ASCII", "646", "ANSI_X3.4-1968", "ANSI_X3.4-1986", "ASCII", "IBM367", "ISO646-US", "ISO_646.irv:1991", "ascii7", "cp367", "csASCII", "iso-ir-6", "iso_646.irv:1983", "us"], Charset::Ascii),
    (&["IBM866", "866", "cp866", "csIBM866", "ibm-866", "ibm866"], Charset::Table(encoding_rs::IBM866)),
    (&["ISO-8859-2", "8859_2", "912", "ISO8859-2", "ISO_8859-2", "ISO_8859-2:1987", "cp912", "csISOLatin2", "ibm-912", "ibm912", "iso-ir-101", "iso8859_2", "l2", "latin2"], Charset::Table(encoding_rs::ISO_8859_2)),
    (&["ISO-8859-3", "8859_3", "913", "ISO8859-3", "ISO_8859-3", "ISO_8859-3:1988", "cp913", "csISOLatin3", "ibm-913", "ibm913", "iso-ir-109", "iso8859_3", "l3", "latin3"], Charset::Table(encoding_rs::ISO_8859_3)),
    (&["ISO-8859-4", "8859_4", "914", "ISO_8859-4", "ISO_8859-4:1988", "cp914", "csISOLatin4", "ibm-914", "ibm914", "iso-ir-110", "iso8859-4", "iso8859_4", "l4", "latin4"], Charset::Table(encoding_rs::ISO_8859_4)),
    (&["ISO-8859-5", "8859_5", "915", "ISO8859-5", "ISO_8859-5", "ISO_8859-5:1988", "cp915", "csISOLatinCyrillic", "cyrillic", "ibm-915", "ibm915", "iso-ir-144", "iso8859_5"], Charset::Table(encoding_rs::ISO_8859_5)),
    (&["ISO-8859-6", "1089", "8859_6", "ASMO-708", "ECMA-114", "ISO8859-6", "ISO_8859-6", "ISO_8859-6:1987", "arabic", "cp1089", "csISOLatinArabic", "ibm-1089", "ibm1089", "iso-ir-127", "iso8859_6"], Charset::Table(encoding_rs::ISO_8859_6)),
    (&["ISO-8859-7", "813", "8859_7", "ECMA-118", "ELOT_928", "ISO_8859-7", "ISO_8859-7:1987", "cp813", "csISOLatinGreek", "greek", "greek8", "ibm-813", "ibm813", "iso-ir-126", "iso8859-7", "iso8859_7", "sun_eu_greek"], Charset::Table(encoding_rs::ISO_8859_7)),
    (&["ISO-8859-8", "8859_8", "916", "ISO8859-8", "ISO_8859-8", "ISO_8859-8:1988", "cp916", "csISOLatinHebrew", "hebrew", "ibm-916", "ibm916", "iso-ir-138", "iso8859_8"], Charset::Table(encoding_rs::ISO_8859_8)),
    (&["ISO-8859-13", "8859_13", "ISO8859-13", "iso8859_13", "iso_8859-13"], Charset::Table(encoding_rs::ISO_8859_13)),
    (&["ISO-8859-15", "8859_15", "923", "IBM-923", "IBM923", "ISO8859-15", "ISO8859_15", "ISO8859_15_FDIS", "ISO_8859-15", "L9", "LATIN0", "LATIN9", "Latin-9", "cp923", "csISO885915", "csISOlatin0", "csISOlatin9"], Charset::Table(encoding_rs::ISO_8859_15)),
    (&["ISO-8859-16", "ISO8859_16", "ISO_8859-16", "ISO_8859-16:2001", "csISO885916", "iso-ir-226", "l10", "latin10"], Charset::Table(encoding_rs::ISO_8859_16)),
    (&["KOI8-R", "cskoi8r", "koi8", "koi8_r"], Charset::Table(encoding_rs::KOI8_R)),
    (&["TIS-620", "tis620", "tis620.2533"], Charset::Table(encoding_rs::WINDOWS_874)),
    (&["x-windows-874", "ms-874", "ms874", "windows-874"], Charset::Table(encoding_rs::WINDOWS_874)),
    (&["windows-1250", "cp1250", "cp5346"], Charset::Table(encoding_rs::WINDOWS_1250)),
    (&["windows-1251", "ansi-1251", "cp1251", "cp5347"], Charset::Table(encoding_rs::WINDOWS_1251)),
    (&["windows-1252", "cp1252", "cp5348", "ibm-1252", "ibm1252"], Charset::Table(encoding_rs::WINDOWS_1252)),
    (&["windows-1253", "cp1253", "cp5349"], Charset::Table(encoding_rs::WINDOWS_1253)),
    (&["windows-1254", "cp1254", "cp5350"], Charset::Table(encoding_rs::WINDOWS_1254)),
    (&["windows-1255", "cp1255"], Charset::Table(encoding_rs::WINDOWS_1255)),
    (&["windows-1256", "cp1256"], Charset::Table(encoding_rs::WINDOWS_1256)),
    (&["windows-1257", "cp1257", "cp5353"], Charset::Table(encoding_rs::WINDOWS_1257)),
    (&["windows-1258", "cp1258"], Charset::Table(encoding_rs::WINDOWS_1258)),
    (&["windows-31j", "MS932", "csWindows31J", "windows-932"], Charset::Table(encoding_rs::SHIFT_JIS)),
];

/// The set a javac `-encoding` name stands for: `Ok(None)` for UTF-8, which the engine reads anyway; `Err` for a set
/// the engine cannot decode as the JDK does.
pub fn named(name: &str) -> Result<Option<Charset>, String> {
    let same = |names: &[&str]| names.iter().any(|known| known.eq_ignore_ascii_case(name));
    if same(UTF_8) {
        return Ok(None);
    }
    SETS.iter().find(|(names, _)| same(names)).map(|(_, set)| Some(*set)).ok_or_else(|| format!("the engine cannot read sources in the encoding {name}"))
}

pub fn decode(bytes: &[u8], set: Charset) -> String {
    match set {
        Charset::Latin1 => bytes.iter().map(|byte| char::from(*byte)).collect(),
        Charset::Ascii => bytes.iter().map(|byte| if byte.is_ascii() { char::from(*byte) } else { char::REPLACEMENT_CHARACTER }).collect(),
        Charset::Table(table) => table.decode_without_bom_handling(bytes).0.into_owned(),
    }
}
