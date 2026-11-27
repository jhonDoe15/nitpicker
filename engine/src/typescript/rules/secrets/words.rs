//! `secret-words.mts` of the shared naming helpers: which names name a secret, and which strings look like one.
//! JavaScript's `\s`, `\d`, `\w`, `\b`, `.` and the `i` flag without `u` are ASCII or have their own sets, so the
//! patterns spell those out; lengths are counted in UTF-16 code units, as `length` counts them.
use regex::Regex;
use std::sync::LazyLock;

const SECRET_NAME_WORDS: [&str; 16] = [
    "password", "passwd", "pwd", "passphrase", "secret", "token", "credentials?", "apikey", "privatekey", "accesskey",
    "secretkey", "authkey", "signingkey", "encryptionkey", "hmackey", "jwtkey",
];
const SECRET_VALUE_SUFFIXES: [&str; 6] = ["value", "raw", "str", "string", "text", "plain"];
const MARKER_TOKEN_WORDS: [&str; 11] = ["eos", "bos", "pad", "unk", "cls", "sep", "mask", "next", "page", "continuation", "cancellation"];
const MASKED_NAME_WORDS: [&str; 2] = ["masked", "redacted"];
const SECRET_VALUE_LENGTH: usize = 6;
const SECRET_CHARACTER_CLASSES: usize = 3;
const PASSPHRASE_LENGTH: usize = 8;
/// JavaScript's `\s`.
pub const SPACE: &str = r"\t\n\x0B\x0C\r\p{Z}\x{FEFF}";
const LINE_CHARACTER: &str = r"[^\n\r\x{2028}\x{2029}]";

fn compiled(pattern: &str) -> Regex {
    Regex::new(pattern).expect("pattern")
}

static LOWER_UPPER: LazyLock<Regex> = LazyLock::new(|| compiled("([a-z0-9])([A-Z])"));
static UPPER_RUN: LazyLock<Regex> = LazyLock::new(|| compiled("([A-Z]+)([A-Z][a-z])"));
static WORD_SPLIT: LazyLock<Regex> = LazyLock::new(|| compiled("[^A-Za-z0-9]+"));
static SECRET_NAME: LazyLock<Regex> = LazyLock::new(|| compiled(&format!("(?:{})$", SECRET_NAME_WORDS.join("|"))));
static SECRET_WORD: LazyLock<Regex> = LazyLock::new(|| {
    let uncovered: Vec<&str> = SECRET_NAME_WORDS
        .iter()
        .copied()
        .filter(|word| !SECRET_NAME_WORDS.iter().any(|other| other != word && word.contains(other)))
        .collect();
    compiled(&uncovered.join("|"))
});
static PASSPHRASE_NAME: LazyLock<Regex> = LazyLock::new(|| compiled("(?:password|passwd|passphrase)$"));
static PLACEHOLDER: LazyLock<Regex> = LazyLock::new(|| {
    let any = LINE_CHARACTER;
    compiled(&format!(
        concat!(
            r"^(?:\*+[A-Za-z0-9_]{{0,4}}|[xX]+|<{a}*>|\[{a}*\]|\$\{{{a}*\}}|\$[A-Za-z_][A-Za-z0-9_]*|\{{\{{{a}*\}}\}}|",
            r"\{{[A-Za-z0-9_]*\}}|%[sS]|%\([A-Za-z0-9_]+\)[sS]|:[A-Za-z_]+|",
            r"(?i-u:changeme|change-me|todo|example|dummy|placeholder|redacted|none|null|undefined)|(?i-u:your)[-_ ]{a}*)$",
        ),
        a = any
    ))
});
static NOT_SECRET: LazyLock<Regex> = LazyLock::new(|| {
    compiled(&format!(
        concat!(
            r"^(?:[A-Z][A-Z0-9_]+|[A-Za-z]+(?:[._:/-][A-Za-z]+)+|[a-z][a-z0-9_-]*(?:[./][a-z0-9_-]+)+|",
            r"(?:~|\.{{1,2}})?(?:/[A-Za-z0-9_.-]+)+/?|\^{a}*\$|",
            r"[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}(?:T[0-9:.]+(?:Z|[+-][0-9]{{2}}:?[0-9]{{2}})?)?)$",
        ),
        a = LINE_CHARACTER
    ))
});
static IDENTIFIER: LazyLock<Regex> = LazyLock::new(|| compiled("^(?:[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+|[a-z]+(?:[A-Z][a-z0-9]*)+)$"));
static CREDENTIALS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"(?-u:\b)AKIA[0-9A-Z]{16}(?-u:\b)",
        r"(?-u:\b)gh[pousr]_[A-Za-z0-9]{30,}",
        r"(?-u:\b)xox[abprs]-[A-Za-z0-9-]{10,}",
        "-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----",
        r"(?-u:\b)[rs]k_(?:live|test)_[A-Za-z0-9]{20,}",
        r"(?-u:\b)sk-(?:proj|ant|live|test)-[A-Za-z0-9_-]{20,}",
    ]
    .iter()
    .map(|pattern| compiled(pattern))
    .collect()
});
static DJANGO: LazyLock<Regex> = LazyLock::new(|| compiled(r"(?-u:\b)django-insecure-"));
static NOT_SPACE_RUN: LazyLock<Regex> = LazyLock::new(|| compiled(&format!("^[^{SPACE}]*")));
static EMBEDDED: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        format!(r"^(?i-u:jdbc:)?[A-Za-z][A-Za-z0-9+.-]*://[^{SPACE}/:@]+:([^{SPACE}/@]+)@"),
        format!(r"^(?i-u:bearer|basic|token)[{SPACE}]+([^{SPACE}\x22]+)$"),
        format!(r"[?&;](?i-u:password)=([^&;{SPACE}]+)"),
    ]
    .iter()
    .map(|pattern| compiled(pattern))
    .collect()
});
static URL_SCHEME: LazyLock<Regex> = LazyLock::new(|| compiled("^[A-Za-z][A-Za-z0-9+.-]*://"));
static HAS_SPACE: LazyLock<Regex> = LazyLock::new(|| compiled(&format!("[{SPACE}]")));
static CHARACTER_CLASSES: LazyLock<[Regex; 4]> = LazyLock::new(|| [compiled("[a-z]"), compiled("[A-Z]"), compiled("[0-9]"), compiled("[^A-Za-z0-9]")]);
static LETTER: LazyLock<Regex> = LazyLock::new(|| compiled("[A-Za-z]"));
static CAMEL: LazyLock<Regex> = LazyLock::new(|| compiled("[a-z][A-Z]"));

/// `text.length`.
pub fn length(text: &str) -> usize {
    text.encode_utf16().count()
}

/// `wordsOf`: the lower-case ASCII words of a name, split at case changes and at other characters.
pub fn words_of(name: &str) -> Vec<String> {
    let spaced = LOWER_UPPER.replace_all(name, "${1} ${2}");
    let spaced = UPPER_RUN.replace_all(&spaced, "${1} ${2}");
    WORD_SPLIT.split(&spaced).filter(|word| !word.is_empty()).map(|word| word.to_ascii_lowercase()).collect()
}

fn name_words(name: &str) -> Vec<String> {
    let mut words = words_of(name);
    let kept = words.iter().rposition(|word| !SECRET_VALUE_SUFFIXES.contains(&word.as_str())).map_or(0, |index| index + 1);
    words.truncate(kept.max(1));
    words
}

fn joined_letters(words: &[String]) -> String {
    words.concat().chars().filter(|character| !character.is_ascii_digit()).collect()
}

/// `isSecretName`.
pub fn is_secret_name(name: &str) -> bool {
    let words = name_words(name);
    let last = words.last().map(String::as_str);
    let before = if words.len() >= 2 { words[words.len() - 2].as_str() } else { "" };
    let marker = last == Some("token") && MARKER_TOKEN_WORDS.contains(&before);
    let masked = words.iter().any(|word| MASKED_NAME_WORDS.contains(&word.as_str()));
    !(marker || masked) && SECRET_NAME.is_match(&joined_letters(&words))
}

fn is_candidate(text: &str) -> bool {
    !(HAS_SPACE.is_match(text) || PLACEHOLDER.is_match(text) || NOT_SECRET.is_match(text))
}

/// `looksLikeSecretValue`.
pub fn looks_like_secret_value(text: &str) -> bool {
    if length(text) < SECRET_VALUE_LENGTH || !is_candidate(text) {
        return false;
    }
    let classes = CHARACTER_CLASSES.iter().filter(|pattern| pattern.is_match(text)).count();
    (CHARACTER_CLASSES[2].is_match(text) && LETTER.is_match(text)) || classes >= SECRET_CHARACTER_CLASSES
}

fn has_django_key(text: &str) -> bool {
    DJANGO.find_iter(text).any(|found| {
        let rest = &text[found.end()..];
        NOT_SPACE_RUN.find(rest).is_some_and(|run| length(run.as_str()) >= 6)
    })
}

/// `hasCredentialShape`.
pub fn has_credential_shape(text: &str) -> bool {
    if CREDENTIALS.iter().any(|shape| shape.is_match(text)) || has_django_key(text) {
        return true;
    }
    EMBEDDED.iter().any(|shape| shape.captures(text).and_then(|found| found.get(1)).is_some_and(|secret| looks_like_secret_value(secret.as_str())))
}

fn is_passphrase(text: &str, name: &str) -> bool {
    let long = length(text) >= PASSPHRASE_LENGTH && CAMEL.is_match(text);
    long && is_candidate(text) && PASSPHRASE_NAME.is_match(&joined_letters(&name_words(name)))
}

fn names_a_secret(text: &str, name: &str) -> bool {
    let words = words_of(text);
    let named = IDENTIFIER.is_match(text) && SECRET_WORD.is_match(&joined_letters(&words));
    named || words.concat() == words_of(name).concat()
}

/// `isHardcodedSecret`.
pub fn is_hardcoded_secret(text: &str, name: &str) -> bool {
    if has_credential_shape(text) || URL_SCHEME.is_match(text) || names_a_secret(text, name) {
        return false;
    }
    looks_like_secret_value(text) || is_passphrase(text, name)
}
