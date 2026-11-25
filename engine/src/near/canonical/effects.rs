use crate::near::tree::{Node, Text, Tree, pre_order};
use std::collections::HashSet;

const PURE_BINARY: [&str; 20] =
    ["+", "-", "*", "<", "<=", ">", ">=", "==", "!=", "===", "!==", "&&", "||", "??", "&", "|", "^", "<<", ">>", ">>>"];
const PURE_UNARY: [&str; 5] = ["!", "-", "+", "~", "typeof"];
const FLOAT_TESTS: [&str; 3] = ["isNaN", "isFinite", "isInfinite"];

fn static_call(owner: &str, method: &str) -> bool {
    match owner {
        "Number" => ["isNaN", "isFinite", "isInteger", "isSafeInteger"].contains(&method),
        "Double" => FLOAT_TESTS.contains(&method) || method == "compare",
        "Float" => FLOAT_TESTS.contains(&method),
        "Integer" | "Long" | "Boolean" => method == "compare",
        "Objects" => ["isNull", "nonNull", "equals"].contains(&method),
        "Array" => method == "isArray",
        _ => false,
    }
}

fn is_static_callee(callee: &Node) -> bool {
    if !callee.is("member") {
        return false;
    }
    let Some(receiver) = callee.children.first().filter(|receiver| receiver.is("name")) else {
        return false;
    };
    let owner = receiver.value.as_deref().unwrap_or("undefined");
    let namespace = matches!(receiver.value.as_deref(), Some("Math" | "Character" | "StrictMath"));
    if namespace {
        return !callee.value_is("random");
    }
    static_call(owner, callee.value.as_deref().unwrap_or("undefined"))
}

fn locally_pure(node: &Node) -> bool {
    match &*node.kind {
        "binary" => node.value.as_deref().is_some_and(|value| PURE_BINARY.contains(&value)),
        "unary" => node.value.as_deref().is_some_and(|value| PURE_UNARY.contains(&value)),
        kind => matches!(kind, "name" | "literal" | "this" | "conditional"),
    }
}

fn pure_parts(node: &Node) -> Option<&[Tree]> {
    if node.is("call") {
        let callee = node.children.first()?;
        return is_static_callee(callee).then(|| &node.children[1..]);
    }
    locally_pure(node).then_some(&node.children[..])
}

fn every_part(node: &Node, accepts: &dyn Fn(&Node) -> bool) -> bool {
    let Some(parts) = pure_parts(node) else {
        return false;
    };
    accepts(node) && parts.iter().all(|part| every_part(part, accepts))
}

pub fn is_pure(node: &Node) -> bool {
    every_part(node, &|_| true)
}

pub fn is_stable(node: &Node, escaping: &HashSet<Option<Text>>) -> bool {
    node.is("none")
        || every_part(node, &|node| {
            !node.is("this")
                && (!node.is("name") || (node.is_bound() && !escaping.contains(&node.value)))
        })
}

pub fn escaping_names(tree: &Tree) -> HashSet<Option<Text>> {
    let mut nodes = Vec::new();
    pre_order(tree, &mut nodes);
    let mut names = HashSet::new();
    for lambda in nodes.into_iter().filter(|node| node.is("lambda")) {
        let mut inner = Vec::new();
        pre_order(lambda, &mut inner);
        names.extend(inner.into_iter().filter(|node| node.is_bound()).map(|node| node.value.clone()));
    }
    names
}

#[derive(Clone, Copy, PartialEq)]
enum Role {
    Read,
    Write,
    Update,
}

pub struct Access {
    pub reads: HashSet<Option<Text>>,
    pub writes: HashSet<Option<Text>>,
}

fn target_role(node: &Node, index: usize, role: Role) -> Role {
    if node.is("expression") && role != Role::Read {
        return role;
    }
    if matches!(&*node.kind, "declare" | "foreach" | "parameter") && index == 1 {
        return Role::Write;
    }
    if node.is("assign") && index == 0 {
        return if node.value_is("=") { Role::Write } else { Role::Update };
    }
    if node.is("update") { Role::Update } else { Role::Read }
}

pub fn accesses_of(root: &Tree) -> Access {
    let mut access = Access { reads: HashSet::new(), writes: HashSet::new() };
    let mut pending: Vec<(&Tree, Role)> = vec![(root, Role::Read)];
    let mut at = 0;
    while let Some(&(node, role)) = pending.get(at) {
        at += 1;
        if node.is_bound() {
            if role != Role::Write {
                access.reads.insert(node.value.clone());
            }
            if role != Role::Read {
                access.writes.insert(node.value.clone());
            }
        }
        for (index, child) in node.children.iter().enumerate() {
            pending.push((child, target_role(node, index, role)));
        }
    }
    access
}

fn leaves(node: &Node, loops: usize, switches: usize, exits: &dyn Fn(&Node, usize, usize) -> bool) -> bool {
    if exits(node, loops, switches) {
        return true;
    }
    if node.is("lambda") {
        return false;
    }
    let loops = loops + usize::from(matches!(&*node.kind, "for" | "while" | "do" | "foreach"));
    let switches = switches + usize::from(node.is("statement") && node.value_is("switch"));
    node.children.iter().any(|child| leaves(child, loops, switches, exits))
}

pub fn continues_loop(body: &Node) -> bool {
    leaves(body, 0, 0, &|node, loops, _| node.is("continue") && (node.value.is_some() || loops == 0))
}
