use crate::near::tree::{Node, Tree, make, none};
use regex::Regex;
use std::rc::Rc;
use std::sync::LazyLock;

type Predicate = (Tree, Tree);

static REFERENCE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?:method_reference|reference):([A-Za-z0-9_.]+)::([A-Za-z0-9_]+)$").expect("regex")
});

fn match_kind(name: &str) -> Option<&'static str> {
    match name {
        "anyMatch" | "some" | "any" => Some("any"),
        "allMatch" | "every" | "all" => Some("all"),
        "noneMatch" | "none" => Some("none"),
        _ => None,
    }
}

fn with_value(mut node: Node, value: &str) -> Node {
    node.value = Some(value.into());
    node
}

fn is_boolean_literal(node: Option<&Tree>, value: &str) -> bool {
    node.is_some_and(|node| node.is("literal") && node.literal.as_deref() == Some("boolean") && node.value_is(value))
}

pub fn negated(node: &Tree) -> Tree {
    if node.is("unary") && node.value_is("!") {
        return node.child(0).clone();
    }
    Rc::new(with_value(make("unary", vec![node.clone()]), "!"))
}

fn is_member(node: Option<&Tree>, names: &[&str]) -> bool {
    node.is_some_and(|node| node.is("member") && node.value.as_deref().is_some_and(|value| names.contains(&value)))
}

fn iterable_of(receiver: &Tree) -> Tree {
    if !receiver.is("call") {
        return receiver.clone();
    }
    let callee = receiver.children.first();
    let rest = receiver.children.len().saturating_sub(1);
    if is_member(callee, &["stream"]) && rest == 0 {
        return callee.expect("callee").child(0).clone();
    }
    if is_member(callee, &["stream"]) && rest == 1 {
        return receiver.child(1).clone();
    }
    if is_member(callee, &["chars", "toCharArray"]) && rest == 0 {
        let inner = callee.expect("callee").child(0).clone();
        return Rc::new(with_value(make("expression", vec![inner]), "characters"));
    }
    receiver.clone()
}

fn returned_value(body: &Tree) -> Option<Tree> {
    if body.category() == "expression" {
        return Some(body.clone());
    }
    let only = body.children.first().filter(|only| body.children.len() == 1 && only.is("return"))?;
    only.children.first().cloned()
}

fn named(binding: &str, value: &str) -> Tree {
    let mut node = with_value(make("name", Vec::new()), value);
    node.binding = Some(binding.into());
    node.text = Some(value.into());
    Rc::new(node)
}

fn reference_parts(node: &Node) -> Option<(String, String)> {
    let groups = REFERENCE.captures(node.value.as_deref().unwrap_or(""))?;
    Some((groups[1].to_string(), groups[2].to_string()))
}

fn reference_predicate(node: &Node) -> Option<Predicate> {
    let (owner, method) = reference_parts(node)?;
    let name = named("bound", "it");
    let callee = Rc::new(with_value(make("member", vec![named("free", &owner)]), &method));
    Some((name.clone(), Rc::new(make("call", vec![callee, name]))))
}

fn predicate_of(lambda: Option<&Tree>) -> Option<Predicate> {
    let lambda = lambda?;
    if lambda.is("expression") {
        return reference_predicate(lambda);
    }
    if !lambda.is("lambda") || lambda.value.is_some() {
        return None;
    }
    let value = returned_value(lambda.child(1));
    let list = lambda.child(0);
    if list.children.len() > 1 {
        return None;
    }
    let value = value?;
    let name = list.children.first().map_or_else(|| named("bound", "it"), |parameter| parameter.child(1).clone());
    Some((name, value))
}

fn lambda_of(name: Tree, value: Tree) -> Tree {
    let parameter = Rc::new(make("parameter", vec![none(), name]));
    let body = Rc::new(make("block", vec![Rc::new(make("return", vec![value]))]));
    Rc::new(make("lambda", vec![Rc::new(make("parameters", vec![parameter])), body]))
}

fn as_condition(node: &Tree) -> Tree {
    let children = node.children.iter().map(as_condition).collect();
    let mut copy = Node { children, ..(**node).clone() };
    if copy.is("binary") && matches!(copy.value.as_deref(), Some("&&" | "||")) {
        copy.commutes = Some(true);
    }
    Rc::new(copy)
}

fn any_of(iterable: &Tree, (name, value): Predicate) -> Tree {
    let lambda = lambda_of(name, as_condition(&value));
    Rc::new(with_value(make("expression", vec![iterable_of(iterable), lambda]), "any"))
}

fn match_of(kind: &str, iterable: &Tree, (name, value): Predicate) -> Tree {
    if kind == "any" {
        return any_of(iterable, (name, value));
    }
    let value = if kind == "all" { negated(&value) } else { value };
    negated(&any_of(iterable, (name, value)))
}

fn generator_match(kind: &str, generator: &Tree) -> Option<Tree> {
    let generators = matches!(generator.value.as_deref(), Some("generator" | "list-comprehension"));
    if !generator.is("expression") || !generators || generator.children.len() != 2 {
        return None;
    }
    let element = generator.child(0);
    let parts = &generator.child(1).children;
    let tested = if kind == "all" { negated(element) } else { element.clone() };
    let filters = parts.iter().skip(2).cloned().chain([tested]);
    let value = filters
        .reduce(|left, right| Rc::new(with_value(make("binary", vec![left, right]), "&&")))
        .expect("tested");
    let name = parts.first().expect("near-duplicate tree: generator name").clone();
    let iterable = parts.get(1).expect("near-duplicate tree: generator iterable");
    if kind == "all" {
        return Some(negated(&any_of(iterable, (name, value))));
    }
    Some(match_of(kind, iterable, (name, value)))
}

pub fn library_match(node: &Tree) -> Option<Tree> {
    if !node.is("call") {
        return None;
    }
    let callee = node.children.first();
    let rest = &node.children[node.children.len().min(1)..];
    let free = callee.filter(|callee| callee.is("name") && callee.binding.as_deref() == Some("free"));
    let builtin = free.and_then(|callee| callee.value.as_deref()).and_then(match_kind);
    if let Some(builtin) = builtin
        && rest.len() == 1
    {
        return generator_match(builtin, &rest[0]);
    }
    let member = callee.filter(|callee| callee.is("member"));
    let kind = member.and_then(|callee| callee.value.as_deref()).and_then(match_kind);
    let predicate = if rest.len() == 1 { predicate_of(rest.first()) } else { None };
    let (kind, predicate) = (kind?, predicate?);
    Some(match_of(kind, callee.expect("callee").child(0), predicate))
}

pub fn as_reference(node: &Tree) -> Option<Tree> {
    let (name, call) = predicate_of(Some(node))?;
    if !call.is("call") || call.children.len() != 2 {
        return None;
    }
    let (callee, argument) = (call.child(0), call.child(1));
    let owner = callee.children.first()?;
    let is_static = callee.is("member")
        && owner.is("name")
        && owner.binding.as_deref() == Some("free")
        && argument.is_bound()
        && argument.value == name.value;
    let owner_name = owner.text.as_deref().or(owner.value.as_deref()).unwrap_or("undefined");
    let method = callee.value.as_deref().unwrap_or("undefined");
    is_static.then(|| Rc::new(with_value(make("expression", Vec::new()), &format!("reference:{owner_name}::{method}"))))
}

pub fn same_reference(node: &Tree) -> Option<Tree> {
    if !node.is("expression") || node.value.as_deref().is_some_and(|value| value.starts_with("reference:")) {
        return None;
    }
    let (owner, method) = reference_parts(node)?;
    Some(Rc::new(with_value((**node).clone(), &format!("reference:{owner}::{method}"))))
}

fn loop_predicate(found_loop: &Tree) -> Option<(Predicate, Tree, bool)> {
    let statements = &found_loop.child(3).children;
    let only = statements.first().filter(|only| statements.len() == 1 && only.is("if"))?;
    if !only.child(2).is("none") {
        return None;
    }
    let then = only.child(1);
    let jump = then.children.first().filter(|jump| then.children.len() == 1 && jump.is("return"));
    let returned = jump.map_or_else(none, |jump| jump.child(0).clone());
    let found = ["true", "false"].into_iter().find(|value| is_boolean_literal(Some(&returned), value))?;
    let predicate = (found_loop.child(1).clone(), only.child(0).clone());
    Some((predicate, found_loop.child(2).clone(), found == "true"))
}

pub fn loop_match(found_loop: Option<&Tree>, next: &Tree) -> Option<Tree> {
    let found_loop = found_loop.filter(|found_loop| found_loop.is("foreach"))?;
    let (predicate, iterable, found) = loop_predicate(found_loop)?;
    let fallback = if next.is("return") { next.children.first() } else { None };
    if !is_boolean_literal(fallback, if found { "false" } else { "true" }) {
        return None;
    }
    let matched = any_of(&iterable, predicate);
    let mut node = make("return", vec![if found { matched } else { negated(&matched) }]);
    node.start = found_loop.start;
    node.end = next.end;
    Some(Rc::new(node))
}

fn negation_child(node: &Tree) -> Option<&Tree> {
    if node.is("unary") && node.value_is("!") { node.children.first() } else { None }
}

pub fn collapsed_negation(node: &Tree) -> Option<Tree> {
    let found = negation_child(node).and_then(negation_child)?;
    (found.is("expression") && found.value_is("any")).then(|| found.clone())
}
