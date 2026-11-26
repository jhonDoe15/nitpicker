//! `receiverNames` and `isRepositoryLike`: the names along a call's receiver, and whether they read like a
//! repository, an entity manager or a model.
use crate::typescript::rules::writes::syntax::{member_name, unwrapped};
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::sync::LazyLock;

const RECEIVER_NAMES: [&str; 5] = ["em", "db", "tx", "trx", "query"];
static RECEIVER_WORDS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)repo|manager|model|prisma|orm|entit").expect("pattern"));

fn next(node: Node) -> Option<Node> {
    if node.is("CallExpression") {
        return node.node("callee").map(unwrapped);
    }
    if node.is("MemberExpression") { node.node("object").map(unwrapped) } else { None }
}

pub fn receiver_names(receiver: Node) -> Vec<String> {
    let mut names = Vec::new();
    let mut current = Some(unwrapped(receiver));
    while let Some(step) = current {
        let name = if step.is("Identifier") {
            step.name().map(|name| name.into_owned())
        } else if step.is("MemberExpression") {
            member_name(step)
        } else {
            None
        };
        names.extend(name);
        current = next(step);
    }
    names
}

pub fn is_repository_like(names: &[String]) -> bool {
    let model = names.first().is_some_and(|first| first.starts_with(|letter: char| letter.is_ascii_uppercase()));
    model || names.iter().any(|name| RECEIVER_NAMES.contains(&name.as_str()) || RECEIVER_WORDS.is_match(name))
}
