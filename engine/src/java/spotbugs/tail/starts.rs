//! StartInConstructor rebuilt from what SpotBugs 4.9.8 reports on test code: SC_START_IN_CTOR for a call of
//! `start()` on a `Thread` or a class below it (`this` too) in a public or protected constructor of a public class
//! that is not final (a protected member class and a member of an interface count as public). Priority 1 when a
//! class of the run extends the class. Otherwise priority 3 (hidden) when the next instruction
//! returns: the call is the last one of the constructor, or sits before `return`, or ends a branch that falls
//! through to the end; 2 otherwise, as before a jump out of a `then` branch, a loop, a `try` or a `synchronized`
//! block. Calls with the same priority make one finding per constructor. The SARIF place is the method called,
//! named after the class javac writes in the call, shown without the package, and without the class when it is
//! the constructor's own (kept at priority 1).
use super::super::dumb::found::{Findings, Found};
use super::super::idioms::encoding::written_owner;
use super::super::idioms::{Compiled, called};
use super::super::taint::lines;
use super::super::{Context, folds, names};
use super::in_order;
use crate::engine::source::{named_children, parent};
use crate::java::helpers::has_modifier;
use tree_sitter::Node;

pub const START: &str = "SC_START_IN_CTOR";

const THREAD: &str = "java.lang.Thread";

fn public_class(class: Node) -> bool {
    if class.kind() != "class_declaration" || has_modifier(class, "final") {
        return false;
    }
    let in_interface = parent(class).and_then(parent).is_some_and(|outer| matches!(outer.kind(), "interface_declaration" | "annotation_type_declaration"));
    has_modifier(class, "public") || in_interface || (has_modifier(class, "protected") && parent(class).is_some_and(|body| body.kind() == "class_body"))
}

fn open_constructor(class: Node, method: &Compiled) -> bool {
    match method.member.kind() {
        "constructor_declaration" => has_modifier(method.member, "public") || has_modifier(method.member, "protected"),
        _ => method.member == class && method.label.starts_with("new "),
    }
}

/// The class javac names in a `start()` call on a thread.
fn started(context: &Context, own: &str, call: Node) -> Option<String> {
    if call.kind() != "method_invocation" || call.child_by_field_name("name").is_none_or(|name| context.text(name) != "start") {
        return None;
    }
    let found = context.resolver.resolve_call(call)?;
    if found.method.is_static || !found.method.parameters.is_empty() {
        return None;
    }
    let owner = written_owner(context, own, call)?;
    context.resolver.index.is_subtype(&owner, THREAD).then_some(owner)
}

/// Statements that write no instruction.
fn silent(statement: Node) -> bool {
    match statement.kind() {
        ";" | "line_comment" | "block_comment" | "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" => true,
        "local_variable_declaration" => named_children(statement).into_iter().filter(|part| part.kind() == "variable_declarator").all(|declarator| declarator.child_by_field_name("value").is_none()),
        _ => false,
    }
}

/// The statement a `break` leaves: the loop or switch around it, or the labelled statement it names.
fn left<'a>(context: &Context, statement: Node<'a>) -> Option<Node<'a>> {
    let label = named_children(statement).into_iter().find(|part| part.kind() == "identifier").map(|name| context.text(name).to_string());
    let mut current = statement;
    while let Some(up) = parent(current) {
        let found = match &label {
            Some(label) => up.kind() == "labeled_statement" && up.named_child(0).is_some_and(|name| context.text(name) == label),
            None => matches!(up.kind(), "while_statement" | "do_statement" | "for_statement" | "enhanced_for_statement" | "switch_expression" | "switch_statement"),
        };
        if found {
            return Some(up);
        }
        current = up;
    }
    None
}

/// Whether the instruction after a statement returns from the constructor: what follows it, through `break`, the
/// end of a `do … while (false)` and the last case of a switch without `default`, is the end or a `return`.
fn returns_next(context: &Context, statement: Node, body: Node) -> bool {
    let mut current = statement;
    loop {
        let Some(up) = parent(current) else { return false };
        match up.kind() {
            "block" | "constructor_body" | "switch_block_statement_group" => {
                let after = named_children(up).into_iter().filter(|part| part.start_byte() >= current.end_byte()).find(|part| !silent(*part) && part.kind() != "switch_label");
                if let Some(next) = after {
                    if next.kind() == "break_statement" {
                        let Some(target) = left(context, next) else { return false };
                        current = target;
                        continue;
                    }
                    return next.kind() == "return_statement" && next.named_child_count() == 0;
                }
                if up == body {
                    return true;
                }
                if parent(up).is_some_and(|outer| outer.kind() == "class_body") {
                    return false;
                }
                if up.kind() == "switch_block_statement_group" {
                    let block = parent(up);
                    let last = block.and_then(|block| named_children(block).into_iter().filter(|part| part.kind() == "switch_block_statement_group").last()) == Some(up);
                    let defaulted = block.is_some_and(|block| named_children(block).into_iter().flat_map(named_children).any(|label| label.kind() == "switch_label" && context.text(label).starts_with("default")));
                    let Some(switch) = block.and_then(parent).filter(|_| last && !defaulted) else { return false };
                    current = switch;
                    continue;
                }
            }
            "if_statement" => {
                if up.child_by_field_name("consequence") == Some(current) && up.child_by_field_name("alternative").is_some() {
                    return false;
                }
            }
            "do_statement" if folds::fixed(context, up.child_by_field_name("condition")) == Some(false) => {}
            "labeled_statement" | "expression_statement" => {}
            _ => return false,
        }
        current = up;
    }
}

pub fn check(context: &Context, own: &str, class: Node, methods: &[Compiled]) {
    if !context.wants(&[START]) || !public_class(class) {
        return;
    }
    let binary = names::binary(context, own);
    let package = names::package_of(&binary).to_string();
    let subclassed = context.project.extended.contains(own);
    for method in methods.iter().filter(|method| !method.lambda && open_constructor(class, method)) {
        let body = method.member.child_by_field_name("body").unwrap_or(method.member);
        let label = &method.label;
        let mut found = Findings::default();
        for node in in_order(&method.nodes) {
            let Some(owner) = started(context, own, node) else { continue };
            let shown = called(context, &owner, "start", &[]);
            let statement = parent(node).filter(|statement| statement.kind() == "expression_statement").unwrap_or(node);
            let priority = if subclassed { 1 } else if returns_next(context, statement, body) { 3 } else { 2 };
            let message = format!("{label} invokes {shown}");
            let own_class = shown.strip_prefix(&format!("{binary}.")).filter(|_| priority > 1);
            let named = own_class.or_else(|| shown.strip_prefix(&format!("{package}.")).filter(|_| !package.is_empty())).unwrap_or(&shown);
            let place = format!("function:{shown}|{package}@{named}");
            found.add(Found { pattern: START, node, line: lines::line(context, node), priority, message, place: Some(place), arguments: vec![label.clone(), shown] });
        }
        found.report(context, label);
    }
}
