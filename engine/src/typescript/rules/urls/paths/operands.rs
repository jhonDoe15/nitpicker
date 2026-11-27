//! `path-operands.mts`: whether a compared value is a file system path or a URI authority, how sure the name makes
//! that, and whether it was case folded.
use super::{PATH_CALLS, PATH_OBJECTS};
use crate::typescript::rules::signatures::{ASSERTION_FORMS, unwrap};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::{CONSTANT_NAME, quasi_raw};
use regex::Regex;
use std::sync::LazyLock;

#[derive(Clone, Copy, PartialEq)]
pub enum Kind {
    Path,
    Authority,
}

pub struct Operand<'s> {
    pub kind: Kind,
    pub strong: bool,
    pub folded: bool,
    pub foreign: bool,
    pub name: String,
    pub owner: Option<Node<'s>>,
}

const PATH_METHODS: [&str; 4] = ["resolve", "join", "normalize", "dirname"];
const FOLDING_METHODS: [&str; 3] = ["toLowerCase", "toLocaleLowerCase", "toUpperCase"];
const NATIVE_OWNERS: [&str; 7] = ["path", "process", "os", "fs", "posix", "win32", "URL"];

struct Names {
    folding: Regex,
    strong_path: Regex,
    weak_path: Regex,
    authority: Regex,
    strong_authority: Regex,
    not_a_path: Regex,
}

static NAMES: LazyLock<Names> = LazyLock::new(|| Names {
    folding: Regex::new(r"(?i)normali[sz]|canonical|fold|lower|equal|same").expect("pattern"),
    strong_path: Regex::new(r"(?:Dir|Directory|Root|Cwd|Folder|FilePath|Filepath|Filename)$|^(?:cwd|dir|dirname)$").expect("pattern"),
    weak_path: Regex::new(r"(?i)path$").expect("pattern"),
    authority: Regex::new(r"(?i)(?:authority|host|hostname)$").expect("pattern"),
    strong_authority: Regex::new(r"(?i)authority$").expect("pattern"),
    not_a_path: Regex::new(r"^(?:rank|apps|libs|config)Dir$").expect("pattern"),
});

fn operand<'s>(kind: Kind, strong: bool, name: &str) -> Operand<'s> {
    Operand { kind, strong, folded: false, foreign: false, name: name.to_string(), owner: None }
}

fn name(node: Option<Node>) -> String {
    node.and_then(|node| node.name()).map(|name| name.into_owned()).unwrap_or_default()
}

fn path_call(callee: Node) -> bool {
    if callee.is("Identifier") {
        return PATH_CALLS.contains(&name(Some(callee)).as_str());
    }
    if !callee.is("MemberExpression") || callee.flag("computed") {
        return false;
    }
    let method = name(callee.node("property"));
    let owner = name(callee.node("object"));
    (PATH_METHODS.contains(&method.as_str()) && PATH_OBJECTS.contains(&owner.as_str()))
        || PATH_CALLS.contains(&method.as_str())
        || (method == "cwd" && owner == "process")
}

fn folding_call(callee: Node) -> bool {
    if callee.is("MemberExpression") && !callee.flag("computed") {
        let method = name(callee.node("property"));
        return FOLDING_METHODS.contains(&method.as_str())
            || (NAMES.folding.is_match(&method) && !PATH_OBJECTS.contains(&name(callee.node("object")).as_str()));
    }
    callee.is("Identifier") && NAMES.folding.is_match(&name(Some(callee)))
}

fn by_name<'s>(name: &str) -> Option<Operand<'s>> {
    let names = &*NAMES;
    if CONSTANT_NAME.is_match(name) || names.not_a_path.is_match(name) {
        return None;
    }
    if name == "__dirname" || name == "__filename" || names.strong_path.is_match(name) {
        return Some(operand(Kind::Path, true, name));
    }
    if names.authority.is_match(name) {
        return Some(operand(Kind::Authority, names.strong_authority.is_match(name), name));
    }
    names.weak_path.is_match(name).then(|| operand(Kind::Path, false, name))
}

fn is_foreign_owner(owner: Node) -> bool {
    !owner.is("ThisExpression") && !owner.is("MetaProperty") && !(owner.is("Identifier") && NATIVE_OWNERS.contains(&name(Some(owner)).as_str()))
}

fn by_property<'s>(node: Node<'s>) -> Option<Operand<'s>> {
    let property = if node.flag("computed") { String::new() } else { name(node.node("property")) };
    if node.node("object").is_some_and(|object| object.is("MetaProperty")) {
        return (property == "dirname" || property == "filename").then(|| operand(Kind::Path, true, &property));
    }
    if property == "fsPath" { Some(operand(Kind::Path, true, &property)) } else { by_name(&property) }
}

fn by_member<'s>(node: Node<'s>) -> Option<Operand<'s>> {
    let found = by_property(node)?;
    let object = node.node("object")?;
    Some(Operand { foreign: is_foreign_owner(object), owner: Some(object), ..found })
}

enum Step<'s> {
    Found(Option<Operand<'s>>),
    Next(Node<'s>),
}

fn template_step(value: Node) -> Step {
    let first = value.nodes("expressions").first().copied();
    match first {
        Some(first) if quasi_raw(value, 0).as_deref() == Some("") => Step::Next(first),
        _ => Step::Found(None),
    }
}

fn call_step<'s>(value: Node<'s>) -> Step<'s> {
    let Some(callee) = value.node("callee") else { return Step::Found(None) };
    if folding_call(callee) {
        return Step::Found(Some(Operand { folded: true, ..operand(Kind::Path, false, "") }));
    }
    Step::Found(path_call(callee).then(|| operand(Kind::Path, true, "")))
}

fn operand_step<'s>(value: Node<'s>) -> Step<'s> {
    match value.kind() {
        "ChainExpression" => value.node("expression").map_or(Step::Found(None), Step::Next),
        "Identifier" => Step::Found(by_name(&name(Some(value)))),
        "MemberExpression" => Step::Found(by_member(value)),
        "BinaryExpression" if value.text("operator").as_deref() == Some("+") => value.node("left").map_or(Step::Found(None), Step::Next),
        "TemplateLiteral" => template_step(value),
        "CallExpression" => call_step(value),
        _ => Step::Found(None),
    }
}

/// `operandOf`: what a compared value is, following the left of `+`, a template's first part and optional chains.
pub fn operand_of(node: Node) -> Option<Operand> {
    let mut current = node;
    loop {
        match operand_step(unwrap(current, ASSERTION_FORMS)) {
            Step::Found(found) => return found,
            Step::Next(next) => current = next,
        }
    }
}
