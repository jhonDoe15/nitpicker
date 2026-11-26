//! SF_SWITCH_FALLTHROUGH and SF_SWITCH_NO_DEFAULT. SpotBugs reads the compiled switch: a case falls through when
//! the instruction just before its code can run on into it, and the default is missing when the default jump
//! lands on code that the last case runs into and no jump goes past it. The cases are laid out the way javac
//! emits them (see the layout module). Each pattern is reported once per method.
use super::super::Context;
use super::layout::{Last, Layout, State, final_break, is_default, statements};
use crate::engine::source::{children, named_children};
use crate::java::types::model::Type;
use std::cell::RefCell;
use tree_sitter::Node;

/// A switch over an enum that names every constant: SpotBugs does not ask for a default.
fn covers_enum(context: &Context, node: Node, groups: &[Node]) -> bool {
    let Some(Type::Class(name, _)) = node.child_by_field_name("condition").and_then(|condition| context.resolver.type_of(condition)) else { return false };
    let Some(count) = context.resolver.index.get(&name).and_then(|info| info.enum_constants) else { return false };
    let mut named = std::collections::HashSet::new();
    for label in groups.iter().flat_map(|group| children(*group)).filter(|part| part.kind() == "switch_label") {
        named.extend(named_children(label).into_iter().map(|constant| context.text(constant).to_string()));
    }
    named.len() as u32 >= count
}

/// A switch over a type other than a number, a string or an enum: it matches patterns, and javac adds a default.
fn selects_objects(context: &Context, node: Node) -> bool {
    let Some(Type::Class(name, _)) = node.child_by_field_name("condition").and_then(|condition| context.resolver.type_of(condition)) else { return false };
    let plain = matches!(name.as_str(), "java.lang.String" | "java.lang.Integer" | "java.lang.Character" | "java.lang.Short" | "java.lang.Byte");
    !plain && context.resolver.index.get(&name).is_some_and(|info| info.enum_constants.is_none())
}

/// Whether javac lays the switch out as a table with holes: the holes jump to the default, so SpotBugs counts it as a case.
fn table_gaps(context: &Context, node: Node, groups: &[Node]) -> bool {
    let numeric = match node.child_by_field_name("condition").and_then(|condition| context.resolver.type_of(condition)) {
        Some(Type::Primitive(name)) => matches!(name, "int" | "char" | "short" | "byte"),
        Some(Type::Class(name, _)) => matches!(name.as_str(), "java.lang.Integer" | "java.lang.Character" | "java.lang.Short" | "java.lang.Byte"),
        _ => false,
    };
    if !numeric {
        return false;
    }
    let mut values = Vec::new();
    let labels = groups.iter().flat_map(|group| children(*group)).filter(|part| part.kind() == "switch_label");
    for value in labels.flat_map(named_children) {
        let known = crate::java::types::project::integer_value(context.file, value).or_else(|| {
            let name = match value.kind() {
                "identifier" => value,
                "field_access" => value.child_by_field_name("field")?,
                _ => return None,
            };
            context.numbers.get(context.text(name)).copied().flatten()
        });
        match known {
            Some(number) => values.push(number),
            None => return false,
        }
    }
    let (Some(low), Some(high)) = (values.iter().min(), values.iter().max()) else { return false };
    let count = values.len() as i64;
    let table = 4 + (high - low + 1) + 3 * 3;
    let lookup = 3 + 2 * count + 3 * count;
    table <= lookup && high - low + 1 > count
}

/// A last `case null -> {}`: javac lays out no code for it, so its case lands right after the goto that ends the case
/// before it, which SpotBugs takes for a fall through.
fn empty_null_rule(context: &Context, group: Node) -> bool {
    let labels: Vec<Node> = children(group).into_iter().filter(|part| part.kind() == "switch_label").flat_map(named_children).collect();
    let body = named_children(group).into_iter().find(|part| part.kind() != "switch_label");
    group.kind() == "switch_rule"
        && labels.len() == 1
        && context.text(labels[0]) == "null"
        && body.is_some_and(|body| body.kind() == "block" && statements(body).is_empty())
}

fn statement_switch(node: Node) -> bool {
    node.parent().is_some_and(|holder| {
        matches!(
            holder.kind(),
            "block" | "constructor_body" | "switch_block_statement_group" | "labeled_statement" | "if_statement" | "while_statement" | "for_statement"
                | "enhanced_for_statement" | "do_statement"
        )
    })
}

/// One switch statement's falls (each falling case's last line), whether a fall stores a field the next case overwrites,
/// and the line a missing default would be reported at.
fn judge(context: &Context, node: Node) -> (Vec<usize>, bool, Option<usize>) {
    let Some(body) = node.child_by_field_name("body") else { return (Vec::new(), false, None) };
    let groups: Vec<Node> = children(body).into_iter().filter(|part| matches!(part.kind(), "switch_block_statement_group" | "switch_rule")).collect();
    let patterns = groups.iter().flat_map(|group| children(*group)).filter(|part| part.kind() == "switch_label").any(|label| {
        named_children(label).iter().any(|part| matches!(part.kind(), "pattern" | "type_pattern" | "record_pattern" | "guard" | "null_literal"))
    });
    let patterns = patterns || selects_objects(context, node);
    let default = groups.iter().position(|group| is_default(*group));
    let empty = |at: usize| groups[at].kind() == "switch_block_statement_group" && statements(groups[at]).is_empty();
    let joined = default.map(|mut at| {
        while at > 0 && empty(at - 1) {
            at -= 1;
        }
        at
    });
    let targets = RefCell::new(Vec::new());
    let end = body.end_byte();
    let layout = Layout { context, final_break: final_break(body), end, targets: &targets };
    let mut state = State { last: Last::Start, alive: true, pending: false };
    let mut falls = Vec::new();
    let mut before_default = None;
    for (at, group) in groups.iter().enumerate() {
        if at > 0 {
            if Some(at) == joined {
                before_default = Some(state.last);
            } else if empty(at - 1) {
            } else if let Last::Runs(line) | Last::Back(line) = state.last {
                falls.push((line, at));
            }
        }
        state = State { alive: true, pending: false, ..state };
        if default.is_none() && at + 2 == groups.len() && empty_null_rule(context, groups[at + 1]) {
            let body = named_children(*group).into_iter().find(|part| part.kind() != "switch_label");
            let after = body.map_or(state, |body| layout.statement(body, state));
            if let (true, Last::Runs(line) | Last::Back(line)) = (after.alive, after.last) {
                falls.push((line, at + 1));
            }
            state = layout.jump(after, end);
            continue;
        }
        state = layout.group(*group, state, at + 1 == groups.len());
    }
    let silent = default.is_some_and(|at| {
        at + 1 == groups.len() && statements(groups[at]).iter().all(|part| part.kind() == ";" || Some(part.id()) == layout.final_break)
    });
    let (before_default, target) = match default {
        Some(_) if silent => (before_default.unwrap_or(Last::Start), end),
        Some(_) => match joined {
            Some(0) | None => (Last::Start, groups[0].start_byte()),
            Some(at) => (before_default.unwrap_or(Last::Start), groups[at].start_byte()),
        },
        None => (state.last, end),
    };
    let jumps = targets.into_inner();
    let reaches = match jumps.iter().max() {
        None => matches!(before_default, Last::Runs(_) | Last::Back(_)),
        Some(furthest) => match before_default {
            Last::Runs(_) => *furthest <= target,
            Last::Back(_) => *furthest <= end && table_gaps(context, node, &groups),
            _ => false,
        },
    };
    let missing = reaches && !patterns && !(default.is_none() && covers_enum(context, node, &groups));
    let dead = falls.iter().any(|(_, at)| overwritten(context, groups[at - 1], groups[*at]));
    (falls.iter().map(|(line, _)| *line).collect(), dead, missing.then(|| context.line(node)))
}

/// The fields a case gives a value with a plain `=` statement.
fn stored_fields(context: &Context, group: Node) -> Vec<(String, String)> {
    statements(group)
        .into_iter()
        .filter(|part| part.kind() == "expression_statement")
        .filter_map(|part| part.named_child(0))
        .filter(|assignment| assignment.kind() == "assignment_expression" && assignment.child_by_field_name("operator").is_some_and(|op| context.text(op) == "="))
        .filter_map(|assignment| super::super::observed::field_key(context, assignment.child_by_field_name("left")?))
        .collect()
}

/// Whether a field the falling case stores is stored again by the next case before anything reads it: SpotBugs
/// then reports the fall through with high priority, however many cases fall through.
fn overwritten(context: &Context, from: Node, into: Node) -> bool {
    let stored = stored_fields(context, from);
    if stored.is_empty() {
        return false;
    }
    let mut read: Vec<(String, String)> = Vec::new();
    for part in statements(into) {
        let assignment = part.named_child(0).filter(|inner| part.kind() == "expression_statement" && inner.kind() == "assignment_expression");
        if let Some(assignment) = assignment.filter(|inner| inner.child_by_field_name("operator").is_some_and(|op| context.text(op) == "=")) {
            let mut used = Vec::new();
            if let Some(value) = assignment.child_by_field_name("right") {
                crate::engine::source::walk(value, |inner| used.extend(super::super::observed::field_key(context, inner)));
            }
            read.extend(used);
            let target = assignment.child_by_field_name("left").and_then(|left| super::super::observed::field_key(context, left));
            if target.is_some_and(|target| stored.contains(&target) && !read.contains(&target)) {
                return true;
            }
            continue;
        }
        crate::engine::source::walk(part, |inner| read.extend(super::super::observed::field_key(context, inner)));
    }
    false
}

pub fn check(context: &Context, member: Node, nodes: &[Node], label: &str) {
    let mut falls: Vec<usize> = Vec::new();
    let mut dead = false;
    let mut missing: Option<usize> = None;
    for node in nodes.iter().filter(|node| node.kind() == "switch_expression" && statement_switch(**node)) {
        let (fall, overwrites, absent) = judge(context, *node);
        falls.extend(fall);
        dead |= overwrites;
        missing = missing.or(absent);
    }
    if let Some(line) = falls.first().copied().filter(|_| falls.len() < 4 || dead) {
        context.report("SF_SWITCH_FALLTHROUGH", member, line, format!("Switch statement found in {label} where one case falls through to the next case"));
    }
    if let Some(line) = missing {
        context.report("SF_SWITCH_NO_DEFAULT", member, line, format!("Switch statement found in {label} where default case is missing"));
    }
}
