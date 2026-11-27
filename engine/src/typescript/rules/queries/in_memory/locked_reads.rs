//! `locked-reads.mts`: a query chain that takes a row lock, by a lock step, a lock option or a lock clause in its
//! SQL text.
use crate::typescript::rules::queries::js_patterns::{Folded, js_pattern};
use crate::typescript::rules::queries::js_patterns::member_name;
use crate::typescript::rules::security_values::unwrapped;
use crate::typescript::rules::urls::values::string_value;
use crate::typescript::rules::support::view::{Node, Value};
use regex::Regex;
use std::sync::LazyLock;

const LOCK_METHODS: [&str; 9] = ["setLock", "setOnLocked", "forUpdate", "forShare", "forKeyShare", "forNoKeyUpdate", "lock", "skipLocked", "noWait"];
const LOCK_KEYS: [&str; 3] = ["lock", "skipLocked", "onLocked"];

static LOCK_CLAUSE: LazyLock<Regex> =
    LazyLock::new(|| js_pattern(r"\bFOR\s+(?:UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b|\bLOCK\s+IN\s+SHARE\s+MODE\b", true));

fn calls_of(call: Node) -> Vec<Node> {
    let mut found = Vec::new();
    let mut current = Some(call);
    while let Some(link) = current {
        if link.is("CallExpression") {
            found.push(link);
        }
        current = match link.kind() {
            "CallExpression" => link.node("callee").map(unwrapped),
            "MemberExpression" => link.node("object").map(unwrapped),
            _ => None,
        };
    }
    found
}

fn is_lock_method(call: Node) -> bool {
    let callee = call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression"));
    callee.and_then(member_name).is_some_and(|method| LOCK_METHODS.contains(&method.as_str()))
}

fn has_lock_key(argument: Node) -> bool {
    let options = unwrapped(argument);
    options.is("ObjectExpression")
        && options.nodes("properties").into_iter().any(|property| {
            let key = property.node("key").filter(|key| key.is("Identifier"));
            property.is("Property") && !property.flag("computed") && key.and_then(|key| key.name()).is_some_and(|name| LOCK_KEYS.contains(&name.as_ref()))
        })
}

fn texts_of(argument: Node) -> Vec<String> {
    argument
        .descendants()
        .into_iter()
        .filter_map(|node| {
            if node.is("Literal") {
                return string_value(Some(node));
            }
            if !node.is("TemplateElement") {
                return None;
            }
            match node.get("value") {
                Value::Node(index) => node.view.at(index).text("raw").map(|text| text.into_owned()),
                _ => None,
            }
        })
        .collect()
}

fn has_lock_clause(argument: Node) -> bool {
    texts_of(argument).iter().any(|text| LOCK_CLAUSE.is_match(&Folded::of(text).text))
}

/// `isLockedRead`.
pub fn is_locked_read(call: Node) -> bool {
    calls_of(call).into_iter().any(|each| is_lock_method(each) || each.nodes("arguments").into_iter().any(|argument| has_lock_key(argument) || has_lock_clause(argument)))
}
