//! FindSelfComparison and FindSelfComparison2 rebuilt from what SpotBugs 4.9.8 reports on test code: a value
//! compared with itself (`==`, `!=`, `<`, `<=`, `>`, `>=`, or `equals`, `compareTo`, `equalsIgnoreCase`,
//! `compareToIgnoreCase`, `startsWith`, `endsWith`, `contains` with a used result), or combined with itself (`-`,
//! `&`, `|`, `^`, also as `-=`), never for `float` or `double`. And SA_FIELD_DOUBLE_ASSIGNMENT (`double`).
//! - FindSelfComparison (`Mode::Stack`): the same field of the same object (`this`, a variable or the class),
//!   read on each side with no store into that field (of any object) on the way, calls or not, `volatile` fields
//!   not: SA_FIELD_*, priority 2; else the same value of a variable, kept through conversions and copies, named
//!   after the first variable that held it: SA_LOCAL_*, priority 1. One finding per method, pattern and field or
//!   name, on the first line; one seen on more than one line stays apart from the same row of FindSelfComparison2.
//! - FindSelfComparison2 (`Mode::Numbers`): the same value number of a variable, not read from a field that a
//!   load still gives (a call or a store since makes it out of date): SA_LOCAL_*, priority 1, named after the
//!   first declared variable holding it; for `-` only on `long` and at priority 2. A call compared the same way:
//!   SA_LOCAL_SELF_COMPARISON at priority 2 named after the called method. Every one reported.
mod double;
mod sites;
mod stale;

use super::super::idioms::Compiled;
use super::super::nulls::redundant::line_before;
use super::super::{Context, names, place, returns};
use super::flow::Walk;
use super::flow::values::{Mode, Seen, Site, Val};
use crate::engine::finding::Finding;
use crate::java::types::model::flag;
use sites::Op;
use std::collections::{HashMap, HashSet};
use tree_sitter::Node;

pub const FIELD_COMPARISON: &str = "SA_FIELD_SELF_COMPARISON";
pub const LOCAL_COMPARISON: &str = "SA_LOCAL_SELF_COMPARISON";
pub const FIELD_COMPUTATION: &str = "SA_FIELD_SELF_COMPUTATION";
pub const LOCAL_COMPUTATION: &str = "SA_LOCAL_SELF_COMPUTATION";
pub use double::DOUBLE;
pub const PATTERNS: &[&str] = &[FIELD_COMPARISON, LOCAL_COMPARISON, FIELD_COMPUTATION, LOCAL_COMPUTATION, DOUBLE];

/// Whether the method belongs to an anonymous or local class: the variables of the code around are its `val$`
/// fields there (not in a lambda, where they are parameters).
fn captures(class: Node, method: &Compiled) -> bool {
    let local = class.kind() == "object_creation_expression" || crate::java::javac::declared_locally(class);
    local && !method.lambda
}

fn walked<'c, 'a>(context: &'c Context<'a>, own: &str, class: Node<'a>, method: &Compiled<'a>, mode: Mode) -> Walk<'c, 'a> {
    let mut walk = Walk::with_mode(context, own, mode);
    walk.captured = captures(class, method).then(|| parameters(context, method));
    super::walk_method(&mut walk, class, method);
    walk
}

fn parameters(context: &Context, method: &Compiled) -> HashSet<String> {
    let mut names = HashSet::new();
    if let Some(list) = method.member.child_by_field_name("parameters") {
        for part in crate::engine::source::named_children(list) {
            names.extend(super::super::expose::parameter_name(part).map(|name| context.text(name).to_string()));
        }
    }
    names
}

struct Found {
    pattern: &'static str,
    line: usize,
    message: String,
    place: String,
    priority: u8,
    arguments: Vec<String>,
}

/// The findings of a method: reported at once, or waiting for the whole run (`stale`).
pub fn check<'a>(context: &Context<'a>, own: &str, class: Node<'a>, method: &Compiled<'a>) -> Vec<(returns::Wait, Finding)> {
    let stack = walked(context, own, class, method, Mode::Stack);
    let numbers = walked(context, own, class, method, Mode::Numbers);
    let mut found: Vec<(Node, Found, bool, Option<returns::Wait>)> = Vec::new();
    let mut first: HashMap<(&str, String), usize> = HashMap::new();
    for site in &stack.sites {
        let Some(op) = sites::op(context, site.node) else { continue };
        if let Some((key, finding)) = from_stack(context, own, method, &stack, site, op) {
            match first.get(&key) {
                Some(&at) => found[at].2 |= found[at].1.line != finding.line,
                None => {
                    first.insert(key, found.len());
                    found.push((site.node, finding, false, None));
                }
            }
        }
    }
    for site in &numbers.sites {
        let Some(op) = sites::op(context, site.node) else { continue };
        found.extend(from_numbers(context, own, method, site, op).map(|(finding, wait)| (site.node, finding, false, wait)));
    }
    found.extend(double::check(context, own, class, method, &stack).into_iter().map(|(node, finding)| (node, finding, false, None)));
    found.sort_by_key(|(.., wait)| wait.is_some());
    let mut seen = HashSet::new();
    let mut waiting = Vec::new();
    for (node, finding, repeated, wait) in found {
        if !seen.insert((finding.pattern, finding.line, finding.message.clone(), finding.priority, finding.place.clone(), repeated)) {
            continue;
        }
        match wait {
            None => context.report_listed(finding.pattern, node, finding.line, finding.message, finding.place, finding.priority, finding.arguments),
            Some(wait) => {
                let listed = context.finding_listed(finding.pattern, node, finding.line, finding.message, finding.place, finding.arguments);
                waiting.extend(listed.map(|listed| (wait, Finding { priority: Some(finding.priority), ..listed })));
            }
        }
    }
    waiting
}

/// Hands the whole run what the file's findings wait for: the side effects of its methods and the fields it
/// stores into.
pub fn note(context: &Context, effects: &returns::Effects, waiting: Vec<(returns::Wait, Finding)>) {
    if !context.wants(&[LOCAL_COMPARISON, LOCAL_COMPUTATION]) {
        return;
    }
    effects.note_quiet(returns::summaries(context, true));
    effects.write(stale::written(context));
    effects.wait(waiting);
}

fn line(context: &Context, node: Node) -> usize {
    line_before(context, node, node.end_byte())
}

fn volatile(context: &Context, (declaring, name): &(String, String)) -> bool {
    let field = context.resolver.index.get(declaring).and_then(|info| info.fields.iter().find(|field| &field.name == name).map(|field| field.flags));
    field.is_some_and(|flags| flags & flag::VOLATILE != 0)
}

/// FindSelfComparison: the field, else the variable, both sides come from; the key it accumulates findings by.
fn from_stack(context: &Context, own: &str, method: &Compiled, walk: &Walk, site: &Site, op: Op) -> Option<((&'static str, String), Found)> {
    if site.left != site.right {
        return None;
    }
    let label = &method.label;
    if let (Val::Load { field, seen, .. }, Val::Load { seen: other, .. }) = (&site.left, &site.right) {
        if volatile(context, field) || !site.current || !near(seen, other, site.calls) {
            return None;
        }
        let (declaring, name) = field;
        let shown = names::field(context, own, declaring, name);
        let (pattern, message) = match op {
            Op::Compute(_) => (FIELD_COMPUTATION, format!("Nonsensical self computation of {shown} with itself in {label}")),
            _ => (FIELD_COMPARISON, format!("Self comparison of {shown} with itself in {label}")),
        };
        let place = format!("{}@{shown}", place::member(context, own, name));
        let key = (pattern, format!("{declaring}.{name}"));
        return Some((key, Found { pattern, line: line(context, site.node), message, place, priority: 2, arguments: vec![shown, label.clone()] }));
    }
    let name = walk.origins.get(site.left.base())?.clone();
    let (pattern, message) = match op {
        Op::Compute(_) => (LOCAL_COMPUTATION, format!("Nonsensical self computation of {name} with itself in {label}")),
        _ => (LOCAL_COMPARISON, format!("Self comparison of {name} with itself {label}")),
    };
    let found = Found { pattern, line: line(context, site.node), message, place: place::variable(label, &name), priority: 1, arguments: vec![name.clone(), label.clone()] };
    Some(((pattern, name), found))
}

/// FindSelfComparison: two loads of a field on one line, or on lines next to each other with no call after the first.
fn near(one: &Seen, two: &Seen, calls: u32) -> bool {
    match one.line.abs_diff(two.line) {
        0 => true,
        1 => one.calls.min(two.calls) == calls,
        _ => false,
    }
}

/// FindSelfComparison2: the same value number, not a field a load still gives.
fn from_numbers(context: &Context, own: &str, method: &Compiled, site: &Site, op: Op) -> Option<(Found, Option<returns::Wait>)> {
    if site.left != site.right || site.current {
        return None;
    }
    let wait = match (&site.right, &site.causes) {
        (Val::Load { field, .. }, Some(causes)) => Some(stale::wait(context, field, causes)?),
        _ => None,
    };
    numbered(context, own, method, site, op).map(|found| (found, wait))
}

fn numbered(context: &Context, own: &str, method: &Compiled, site: &Site, op: Op) -> Option<Found> {
    let label = &method.label;
    let name = sites::first_declared(context, site)?;
    let line = line(context, site.node);
    match op {
        Op::Compare => {
            let message = format!("Self comparison of {name} with itself {label}");
            Some(Found { pattern: LOCAL_COMPARISON, line, message, place: place::variable(label, &name), priority: 1, arguments: vec![name, label.clone()] })
        }
        Op::Compute(subtract) => {
            let long = sites::long(context, site.node);
            if subtract && !long {
                return None;
            }
            let message = format!("Nonsensical self computation of {name} with itself in {label}");
            let priority = if subtract { 2 } else { 1 };
            Some(Found { pattern: LOCAL_COMPUTATION, line, message, place: place::variable(label, &name), priority, arguments: vec![name, label.clone()] })
        }
        Op::Call => {
            let called = sites::called(context, site.node)?;
            let message = format!("Self comparison of {called} with itself {label}");
            Some(Found { pattern: LOCAL_COMPARISON, line, message, place: format!("{}|{}", place::variable(&called, &name), names::package_of(own)), priority: 2, arguments: vec![called, label.clone()] })
        }
    }
}
