//! `hash-calls.mts` of the ESLint plugin: the calls that take a digest name, the weak names they get, and the hash
//! options properties a call checks for itself.
use super::sources::{is_hmac_call, is_hmac_options, is_weak};
use crate::typescript::rules::module_values::{Bindings, imported_function};
use crate::typescript::rules::security_values::leaves::leaf_values;
use crate::typescript::rules::security_values::{member_name, property_named, static_key, unwrapped};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::string_value;
use regex::Regex;
use std::sync::LazyLock;

pub const CRYPTO_JS_WEAK: [&str; 4] = ["MD5", "SHA1", "HmacMD5", "HmacSHA1"];
const ALGORITHM_FIRST: [&str; 5] = ["createHash", "createHmac", "createSign", "createVerify", "hash"];
const SUBTLE_METHODS: [&str; 7] = ["digest", "sign", "verify", "importKey", "generateKey", "deriveBits", "deriveKey"];
const ARGUMENT_WRAPPERS: [&str; 4] = ["Property", "ObjectExpression", "ArrayExpression", "SpreadElement"];
/// `\w` of a JavaScript regular expression with the `i` and `u` flags.
const WORD: &str = r"[A-Za-z0-9_\x{17F}\x{212A}]";

static HASH_CALL_NAME: LazyLock<Regex> = LazyLock::new(|| {
    let suffix = format!("es|ed|With{WORD}*|Of|For|Sync|Async|File|Text|String|Buffer|Bytes|Hex|Base64|Stream");
    Regex::new(&format!("(?i)(?:hash|digest|checksum|hmac|fingerprint)(?:{suffix})?$")).expect("pattern")
});
static PREDICATE_NAME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(?:is|has|assert|reject|supports?|check|validate|ensure|allow)[A-Z_]").expect("pattern"));
static HASH_PROPERTY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^(?:(?:hash|digest|checksum|signature|hmac)-?(?:algorithm|alg|function|name|type)?|algorithm|alg)$").expect("pattern")
});

pub struct Scope<'c, 'a, 's> {
    pub scopes: &'c Scopes<'a, 's>,
    pub crypto: Bindings,
    pub crypto_js: Bindings,
}

/// `Finding`: whether the call is about HMAC, the weak names it calls by, and the weak values it gets.
pub struct Finding<'s> {
    pub hmac: bool,
    pub names: Vec<String>,
    pub leaves: Vec<Node<'s>>,
}

/// `weakLeaves`: the values a node can take that name a weak digest.
pub fn weak_leaves<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Vec<Node<'s>> {
    if node.is_none() {
        return Vec::new();
    }
    leaf_values(scopes, node).into_iter().filter(|leaf| string_value(Some(*leaf)).is_some_and(|text| is_weak(&text))).collect()
}

fn name_of(callee: Node) -> Option<String> {
    let target = unwrapped(callee);
    if target.is("Identifier") {
        return target.name().map(|name| name.into_owned());
    }
    if target.is("MemberExpression") { member_name(target) } else { None }
}

fn is_subtle(callee: Node) -> bool {
    let target = unwrapped(callee);
    let Some(object) = target.node("object").filter(|_| target.is("MemberExpression")) else { return false };
    (object.is("Identifier") && object.name().as_deref() == Some("subtle"))
        || (object.is("MemberExpression") && member_name(object).as_deref() == Some("subtle"))
}

fn object_entries(argument: Node) -> Vec<Node> {
    let object = unwrapped(argument);
    if object.is("ObjectExpression") { object.nodes("properties") } else { Vec::new() }
}

fn hash_entry(entry: Node) -> bool {
    entry.is("Property") && HASH_PROPERTY.is_match(&static_key(entry).unwrap_or_default())
}

pub fn is_hash_property(node: Node) -> bool {
    static_key(node).is_some_and(|key| HASH_PROPERTY.is_match(&key))
}

impl<'s> Scope<'_, '_, 's> {
    fn subtle_entry_leaves(&self, entry: Node<'s>) -> Vec<Node<'s>> {
        let key = static_key(entry);
        if !matches!(key.as_deref(), Some("hash" | "name")) || !entry.is("Property") {
            return Vec::new();
        }
        let value = entry.node("value");
        let mut leaves = weak_leaves(self.scopes, value);
        leaves.extend(weak_leaves(self.scopes, property_named(self.scopes, value, "name")));
        leaves
    }

    fn argument_leaves(&self, call: Node<'s>, entry_leaves: impl Fn(Node<'s>) -> Vec<Node<'s>>) -> Vec<Node<'s>> {
        let mut leaves = Vec::new();
        for argument in call.nodes("arguments") {
            leaves.extend(weak_leaves(self.scopes, Some(argument)));
            for entry in object_entries(argument) {
                leaves.extend(entry_leaves(entry));
            }
        }
        leaves
    }

    fn direct_finding(&self, call: Node<'s>, name: &str) -> Finding<'s> {
        let arguments = call.list("arguments");
        let argument = |index: usize| arguments.get(index).copied().flatten();
        if ALGORITHM_FIRST.contains(&name) || name == "sign" || name == "verify" {
            return Finding { hmac: name == "createHmac", names: Vec::new(), leaves: weak_leaves(self.scopes, argument(0)) };
        }
        let position = match name {
            "pbkdf2" | "pbkdf2Sync" => Some(4),
            "hkdf" | "hkdfSync" => Some(0),
            _ => None,
        };
        Finding { hmac: false, names: Vec::new(), leaves: weak_leaves(self.scopes, position.and_then(argument)) }
    }

    /// `callFinding`: a call that hashes, by the module function it calls, Web Crypto, or a hashing helper's name.
    pub fn call_finding(&self, call: Node<'s>) -> Option<Finding<'s>> {
        let callee = call.node("callee")?;
        let direct = imported_function(self.scopes, callee, &self.crypto);
        let crypto_js = imported_function(self.scopes, callee, &self.crypto_js);
        let name = name_of(callee);
        if let Some(crypto_js) = crypto_js.filter(|name| CRYPTO_JS_WEAK.contains(&name.as_str())) {
            return Some(Finding { hmac: crypto_js.starts_with("Hmac"), names: vec![crypto_js], leaves: Vec::new() });
        }
        if let Some(direct) = direct {
            return Some(self.direct_finding(call, &direct));
        }
        let name = name?;
        if SUBTLE_METHODS.contains(&name.as_str()) && is_subtle(callee) {
            let hmac = call.nodes("arguments").into_iter().any(|argument| is_hmac_options(Some(unwrapped(argument))));
            return Some(Finding { hmac, names: Vec::new(), leaves: self.argument_leaves(call, |entry| self.subtle_entry_leaves(entry)) });
        }
        if !HASH_CALL_NAME.is_match(&name) || PREDICATE_NAME.is_match(&name) {
            return None;
        }
        let entry_leaves = |entry: Node<'s>| if hash_entry(entry) { weak_leaves(self.scopes, entry.node("value")) } else { Vec::new() };
        Some(Finding { hmac: is_hmac_call(call), names: Vec::new(), leaves: self.argument_leaves(call, entry_leaves) })
    }

    /// `isCheckedArgument`: the node sits in the arguments of a call this rule checks itself.
    pub fn is_checked_argument(&self, node: Node<'s>) -> bool {
        let call = node.ancestors().find(|owner| !ARGUMENT_WRAPPERS.contains(&owner.kind()));
        call.is_some_and(|call| call.is("CallExpression") && self.call_finding(call).is_some())
    }
}
