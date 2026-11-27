//! The property names `\p{...}` accepts, by JDK version, from `properties.tsv` (written by `parity/errorprone/RegexProbe.java`).
use std::collections::HashMap;
use std::sync::OnceLock;

struct Names {
    plain: HashMap<&'static str, u32>,
    binary: HashMap<&'static str, u32>,
    blocks: HashMap<&'static str, u32>,
    scripts: HashMap<&'static str, u32>,
}

/// `properties.tsv`: kind, name and the first JDK that knows it.
fn names() -> &'static Names {
    static NAMES: OnceLock<Names> = OnceLock::new();
    NAMES.get_or_init(|| {
        let mut names = Names { plain: HashMap::new(), binary: HashMap::new(), blocks: HashMap::new(), scripts: HashMap::new() };
        for line in include_str!("properties.tsv").lines() {
            let mut parts = line.split('\t');
            let (Some(kind), Some(name)) = (parts.next(), parts.next()) else { continue };
            let since: u32 = parts.next().and_then(|since| since.parse().ok()).unwrap_or(0);
            let set = match kind {
                "P" => &mut names.plain,
                "I" => &mut names.binary,
                "B" => &mut names.blocks,
                _ => &mut names.scripts,
            };
            set.insert(name, since);
        }
        names
    })
}

fn known(set: &HashMap<&'static str, u32>, name: &str, jdk: u32) -> bool {
    set.get(name).is_some_and(|since| *since <= jdk)
}

fn upper(text: &str) -> String {
    text.to_uppercase()
}

const POSIX: &[&str] =
    &["ALPHA", "LOWER", "UPPER", "DIGIT", "ALNUM", "PUNCT", "GRAPH", "PRINT", "BLANK", "CNTRL", "XDIGIT", "SPACE"];

/// Whether `Pattern` knows the property name, or the message it gives. With `UNICODE_CHARACTER_CLASS` the POSIX
/// names match in any case.
pub(super) fn property(name: &str, jdk: u32, unicode_classes: bool) -> Result<(), String> {
    let names = names();
    if unicode_classes && POSIX.contains(&upper(name).as_str()) {
        return Ok(());
    }
    if let Some((key, value)) = name.split_once('=') {
        let known = match upper(key).as_str() {
            "SC" | "SCRIPT" => known(&names.scripts, upper(value).as_str(), jdk),
            "BLK" | "BLOCK" => known(&names.blocks, upper(value).as_str(), jdk),
            "GC" | "GENERAL_CATEGORY" => known(&names.plain, value, jdk),
            _ => false,
        };
        return if known { Ok(()) } else { Err(format!("Unknown Unicode property {{name=<{}>, value=<{value}>}}", key.to_lowercase())) };
    }
    let known = if let Some(block) = name.strip_prefix("In") {
        known(&names.blocks, upper(block).as_str(), jdk)
    } else if let Some(rest) = name.strip_prefix("Is") {
        let shouted = upper(rest);
        known(&names.binary, shouted.as_str(), jdk) || known(&names.scripts, shouted.as_str(), jdk) || known(&names.plain, rest, jdk)
    } else {
        known(&names.plain, name, jdk)
    };
    if known { Ok(()) } else { Err(format!("Unknown character property name {{{name}}}")) }
}
