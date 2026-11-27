//! `tls-text.mts` of the ESLint plugin: strings that turn TLS verification off, a connection URL parameter, a
//! browser flag or `NODE_TLS_REJECT_UNAUTHORIZED=0` given to a shell.
use crate::typescript::rules::security_values::{call_name, member_name};
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::urls::values::{SPACE, quasi_text};
use regex::Regex;
use std::sync::LazyLock;

const LOOKUPS: [&str; 9] = ["has", "includes", "indexOf", "startsWith", "endsWith", "delete", "filter", "some", "find"];
const COLLECTIONS: [&str; 3] = ["Set", "Map", "WeakSet"];
const PASSTHROUGH: [&str; 5] = ["ArrayExpression", "TemplateLiteral", "SpreadElement", "ConditionalExpression", "LogicalExpression"];
const TYPE_WRAPPERS: [&str; 5] = ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion", "ChainExpression"];

static ENV_TEXT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"NODE_TLS_REJECT_UNAUTHORIZED=0").expect("pattern"));
static ENV_ASSIGNMENT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(&format!(r"^{SPACE}*NODE_TLS_REJECT_UNAUTHORIZED=0{SPACE}*$")).expect("pattern"));
static URL_TEXT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)[?&](?:sslmode=no-verify|tlsAllowInvalidCertificates=true|tlsAllowInvalidHostnames=true|tlsInsecure=true|sslValidate=false)(?:&|$|#)")
        .expect("pattern")
});
static FLAG_TEXT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(&format!(r"^(?:--)?ignore-certificate-errors(?:=[^{}]*)?$", &SPACE[1..SPACE.len() - 1])).expect("pattern"));
static LAUNCHER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|fork|execa|execaSync|execaCommand|execaCommandSync|\$)$").expect("pattern")
});

fn text_parts(node: Node) -> Vec<String> {
    if node.is("TemplateLiteral") {
        return (0..node.list("quasis").len()).map(|index| quasi_text(node, index)).collect();
    }
    match node.get("value") {
        Value::Text(..) => crate::typescript::rules::urls::values::string_value(Some(node)).into_iter().collect(),
        _ => Vec::new(),
    }
}

fn whole_text(node: Node, parts: &[String]) -> Option<String> {
    let placeholders = node.is("TemplateLiteral") && !node.nodes("expressions").is_empty();
    (!placeholders).then(|| parts.concat())
}

fn is_type_wrapper(node: Node) -> bool {
    TYPE_WRAPPERS.contains(&node.kind())
}

/// `consumer`: the first ancestor that is not an array, template, spread, branch, `+` or type wrapper, and its
/// child on the way.
fn consumer(node: Node) -> (Option<Node>, Option<Node>) {
    let mut holder = node;
    for owner in node.ancestors() {
        let concatenation = owner.is("BinaryExpression") && owner.text("operator").as_deref() == Some("+");
        if !(PASSTHROUGH.contains(&owner.kind()) || is_type_wrapper(owner) || concatenation) {
            return (Some(owner), Some(holder));
        }
        holder = owner;
    }
    (None, None)
}

fn is_lookup(owner: Option<Node>, holder: Option<Node>) -> bool {
    let Some(owner) = owner else { return false };
    match owner.kind() {
        "BinaryExpression" | "SwitchCase" => true,
        "MemberExpression" => owner.node("object") == holder && member_name(owner).is_some_and(|name| LOOKUPS.contains(&name.as_str())),
        "NewExpression" => owner.node("callee").and_then(|callee| callee.name()).is_some_and(|name| COLLECTIONS.contains(&name.as_ref())),
        "CallExpression" => owner.node("callee") != holder && call_name(owner).is_some_and(|name| LOOKUPS.contains(&name.as_str())),
        _ => false,
    }
}

fn reaches_launcher(owner: Option<Node>) -> bool {
    owner.is_some_and(|owner| owner.is("CallExpression") && LAUNCHER.is_match(&call_name(owner).unwrap_or_default()))
}

/// `hasInsecureText`, for a string literal or a template.
pub fn has_insecure_text(node: Node) -> bool {
    let parts = text_parts(node);
    if parts.iter().any(|text| URL_TEXT.is_match(text)) {
        return true;
    }
    let whole = whole_text(node, &parts);
    let (owner, holder) = consumer(node);
    if whole.as_deref().is_some_and(|whole| FLAG_TEXT.is_match(whole)) {
        return !is_lookup(owner, holder);
    }
    let env = parts.iter().any(|text| ENV_TEXT.is_match(text));
    env && (whole.as_deref().is_some_and(|whole| ENV_ASSIGNMENT.is_match(whole)) || reaches_launcher(owner))
}
