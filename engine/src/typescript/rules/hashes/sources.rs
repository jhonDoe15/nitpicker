//! `hash-sources.mts` of the ESLint plugin: weak digest names, the packages that only compute weak digests, and the
//! signs that a call or an options object is about HMAC.
use crate::typescript::rules::security_values::{call_name, static_key};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::{SPACE, string_value};
use regex::Regex;
use std::sync::LazyLock;

const OTP_KEYS: [&str; 7] = ["digits", "period", "step", "counter", "window", "secret", "issuer"];
const WEAK_PACKAGES: [&str; 10] =
    ["md5", "md5.js", "js-md5", "blueimp-md5", "spark-md5", "ts-md5", "sha1", "js-sha1", "crypto-js/md5", "crypto-js/sha1"];
const NOBLE_WEAK: &[&str] = &["md5", "sha1", "ripemd160"];
const HASH_WASM_WEAK: &[&str] = &["md4", "md5", "sha1", "ripemd160", "createMD4", "createMD5", "createSHA1", "createRIPEMD160"];

static WEAK_NAME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?:(?:rsa|dsa|ecdsa)-(?:with-)?)?(?:md[245]|sha-?1|ripemd-?160|rmd-?160)(?:-?with-?(?:rsa|dsa)?-?encryption|-?with-?rsa)?$")
        .expect("pattern")
});
static SEPARATOR: LazyLock<Regex> = LazyLock::new(|| Regex::new(&format!("{SPACE}|_")).expect("pattern"));
static MD_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)^(?:hmac)?md[245]$").expect("pattern"));
static HMAC_CALL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)hmac").expect("pattern"));

pub fn is_weak_package(source: Option<&str>) -> bool {
    source.is_some_and(|source| WEAK_PACKAGES.contains(&source))
}

pub fn hmac_package_algorithm(source: Option<&str>) -> Option<&'static str> {
    match source? {
        "crypto-js/hmac-md5" => Some("md5"),
        "crypto-js/hmac-sha1" => Some("sha1"),
        _ => None,
    }
}

/// `isWeak`: MD2, MD4, MD5, SHA-1 or RIPEMD-160, alone or in a signature algorithm name.
pub fn is_weak(text: &str) -> bool {
    WEAK_NAME.is_match(&SEPARATOR.replace_all(&text.to_lowercase(), "-"))
}

pub fn is_message_digest(text: &str) -> bool {
    MD_NAME.is_match(text.strip_prefix("create").unwrap_or(text))
}

pub fn weak_named_imports(source: &str) -> Option<&'static [&'static str]> {
    match source {
        "@noble/hashes/legacy" | "@noble/hashes/legacy.js" | "@noble/hashes/sha1" | "@noble/hashes/sha1.js" | "@noble/hashes/ripemd160"
        | "@noble/hashes/ripemd160.js" => Some(NOBLE_WEAK),
        "hash-wasm" => Some(HASH_WASM_WEAK),
        _ => None,
    }
}

/// `packageSource`: the module an import declaration or a `require` call names.
pub fn package_source(node: Node) -> Option<String> {
    if node.is("ImportDeclaration") {
        return node.node("source").and_then(|source| source.text("value")).map(|value| value.into_owned());
    }
    let callee = node.node("callee").filter(|callee| node.is("CallExpression") && callee.is("Identifier"))?;
    (callee.name().as_deref() == Some("require")).then(|| string_value(node.list("arguments").first().copied().flatten())).flatten()
}

pub fn is_hmac_call(call: Node) -> bool {
    HMAC_CALL.is_match(&call_name(call).unwrap_or_default())
}

fn includes(call: Node, node: Node) -> bool {
    call.list("arguments").contains(&Some(node))
}

/// `isHmacArgument`: a name passed to an HMAC call, or called to make a value passed to one.
pub fn is_hmac_argument(identifier: Node) -> bool {
    let Some(owner) = identifier.parent().filter(|owner| owner.is("CallExpression")) else { return false };
    if includes(owner, identifier) {
        return is_hmac_call(owner);
    }
    let outer = owner.parent().filter(|outer| outer.is("CallExpression"));
    owner.node("callee") == Some(identifier) && outer.is_some_and(|outer| includes(outer, owner) && is_hmac_call(outer))
}

/// `isHmacOptions`: an object with a one-time-password option, or `name: "HMAC"`.
pub fn is_hmac_options(object: Option<Node>) -> bool {
    let entries = object.filter(|object| object.is("ObjectExpression")).map(|object| object.nodes("properties")).unwrap_or_default();
    entries.into_iter().any(|entry| {
        let key = static_key(entry);
        key.as_deref().is_some_and(|key| OTP_KEYS.contains(&key))
            || (key.as_deref() == Some("name")
                && entry.is("Property")
                && string_value(entry.node("value")).is_some_and(|value| value.to_uppercase() == "HMAC"))
    })
}
