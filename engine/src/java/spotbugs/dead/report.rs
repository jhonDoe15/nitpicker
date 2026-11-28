//! The findings of one method, with SpotBugs' priorities, names and lines.
use super::super::{Context, nulls::redundant::line_before, place};
use super::{flow::{Fate, Live}, slots::{Kind, Layout, Var}, value::{self, Value}};
use crate::engine::source::{named_children, parent};
use crate::java::types::model::Type;
use std::collections::{BTreeMap, HashSet};
use tree_sitter::Node;

pub const STORE: &str = "DLS_DEAD_LOCAL_STORE";
pub const SHADOWS: &str = "DLS_DEAD_LOCAL_STORE_SHADOWS_FIELD";
pub const NULL: &str = "DLS_DEAD_LOCAL_STORE_OF_NULL";
pub const CLASS: &str = "DLS_DEAD_STORE_OF_CLASS_LITERAL";
pub const RETURN: &str = "DLS_DEAD_LOCAL_INCREMENT_IN_RETURN";
pub const OVERWRITTEN: &str = "IP_PARAMETER_IS_DEAD_BUT_OVERWRITTEN";
pub const PATTERNS: &[&str] = &[STORE, SHADOWS, NULL, CLASS, RETURN, OVERWRITTEN];

pub struct Method<'c, 'a> {
    pub context: &'c Context<'a>,
    pub layout: &'c Layout<'a>,
    pub live: &'c Live<'a>,
    pub label: &'c str,
    pub body: Node<'a>,
    /// The fields the method's own class declares: instance fields, or static ones for a static method.
    pub fields: &'c HashSet<String>,
    /// A compact constructor: its parameters are stored into the fields when it ends.
    pub compact: bool,
    /// Lines of `finally` and `synchronized` handlers, on which no dead store is reported.
    pub handlers: &'c HashSet<usize>,
}

struct Found<'a> {
    pattern: &'static str,
    node: Node<'a>,
    name: String,
    priority: u8,
}

/// What the value is that a store writes. An assignment whose value is used is stored after a `dup`.
fn stored(method: &Method, fate: &Fate, var: &Var) -> Value {
    let node = fate.node;
    let value = match node.kind() {
        "variable_declarator" | "resource" => node.child_by_field_name("value"),
        "assignment_expression" if node.child_by_field_name("operator").is_some_and(|operator| method.context.text(operator) == "=") => node.child_by_field_name("right"),
        _ => None,
    };
    let dup = node.kind() == "assignment_expression" && value::used(node);
    value.filter(|_| !dup).map_or(Value::Other, |value| value::of(method.context, method.layout, value, &var.ty))
}

/// The value type of a variable as the flow knows it: what its only initial value is, or its declared type.
fn value_type(method: &Method, var: &Var) -> Option<Type> {
    let value = var.decl.child_by_field_name("value").filter(|_| var.kind == Kind::Local && method.layout.stores.get(&var.slot) == Some(&1));
    value.and_then(|value| method.context.resolver.type_of(value)).or_else(|| var.ty.clone())
}

fn small(kind: &Option<Type>) -> bool {
    match kind {
        Some(Type::Primitive(name)) => !matches!(*name, "long" | "double"),
        Some(Type::Class(name, _)) => name == "java.lang.String",
        _ => false,
    }
}

fn returned(node: Node) -> bool {
    let mut holder = parent(node);
    while let Some(around) = holder.filter(|around| around.kind() == "parenthesized_expression") {
        holder = parent(around);
    }
    holder.is_some_and(|holder| holder.kind() == "return_statement")
}

fn priority(method: &Method, fate: &Fate, var: &Var, value: Value, iinc: bool, shadows: bool) -> u8 {
    let (layout, parameter) = (method.layout, var.kind == Kind::Parameter);
    if entry(method, var) {
        return 1;
    }
    let mut priority: i32 = if shadows || parameter { 1 } else { 2 };
    let copy = matches!(value, Value::Copy(copied) if small(&value_type(method, &layout.vars[copied])));
    match value {
        Value::Copy(copied) if copied == fate.var => priority += if parameter || shadows { copy && !(shadows && parameter) } else { fate.killed || shared(layout, fate.var) } as i32,
        Value::New => priority -= 1,
        Value::Field => priority += 1,
        Value::Copy(_) => priority += copy as i32,
        _ => {}
    }
    priority += (fate.killed && value != Value::Copy(fate.var)) as i32;
    priority += (layout.stores.get(&var.slot).copied().unwrap_or(0) >= 4) as i32;
    priority += (iinc && layout.increments.get(&var.slot).copied().unwrap_or(0) >= 2) as i32;
    priority.clamp(1, 5) as u8
}

pub fn report(method: &Method) {
    let context = method.context;
    let mut fates: Vec<&Fate> = method.live.fates.values().collect();
    fates.sort_by_key(|fate| (fate.node.start_byte(), fate.node.end_byte()));
    let mut found = Vec::new();
    for fate in &fates {
        let var = &method.layout.vars[fate.var];
        if skipped(method, var) || !fate.dead || method.handlers.contains(&line(context, fate.node)) || (value::duplicated(fate.node, &var.ty) && !entry(method, var)) {
            continue;
        }
        let iinc = matches!(fate.node.kind(), "update_expression" | "assignment_expression") && value::increment(context, method.layout, fate.node);
        let name = name(method, fate, var);
        let entry = entry(method, var);
        let postfix = fate.node.kind() == "update_expression" && !context.text(fate.node).trim_start().starts_with(['+', '-']);
        if iinc && postfix && returned(fate.node) {
            found.push(Found { pattern: RETURN, node: fate.node, name, priority: if var.kind == Kind::Parameter { 1 } else { 2 } });
            continue;
        }
        let value = stored(method, fate, var);
        let (pattern, priority) = match value {
            Value::Caught | Value::Constant { wide: false } => continue,
            Value::Constant { wide: true } if method.layout.stores.get(&var.slot) == Some(&1) => continue,
            Value::Null => (NULL, if entry { 1 } else { 3 }),
            Value::Class => (CLASS, 2),
            _ => {
                let shadows = method.fields.contains(&name);
                (if shadows { SHADOWS } else { STORE }, priority(method, fate, var, value, iinc, shadows))
            }
        };
        found.push(Found { pattern, node: fate.node, name, priority });
    }
    overwritten(method, &fates, &mut found);
    emit(method, found);
}

fn shared(layout: &Layout, var: usize) -> bool { layout.vars.iter().enumerate().any(|(index, other)| index != var && other.slot == layout.vars[var].slot) }
fn entry(method: &Method, var: &Var) -> bool { var.kind == Kind::Parameter && !method.live.read_on_entry(var.slot) }

/// Stores never reported: to a handler's exception, a resource, a variable of a `switch` pattern, and the
/// parameters of a compact constructor.
fn skipped(method: &Method, var: &Var) -> bool {
    match var.kind {
        Kind::Catch | Kind::Resource => true,
        Kind::Pattern => crate::engine::source::ancestor(var.decl, &["switch_label"]).is_some(),
        Kind::Parameter => method.compact,
        _ => false,
    }
}

/// IP_PARAMETER_IS_DEAD_BUT_OVERWRITTEN: a parameter whose value is never read, at its first store.
fn overwritten<'a>(method: &Method<'_, 'a>, fates: &[&Fate<'a>], found: &mut Vec<Found<'a>>) {
    let mut seen = HashSet::new();
    for fate in fates {
        let var = &method.layout.vars[fate.var];
        if var.kind != Kind::Parameter || method.compact || method.live.read_on_entry(var.slot) || !seen.insert(fate.var) {
            continue;
        }
        let priority = match stored(method, fate, var) {
            _ if !fate.dead => 3,
            Value::Constant { .. } => 2,
            _ => 1,
        };
        found.push(Found { pattern: OVERWRITTEN, node: fate.node, name: var.name.clone(), priority });
    }
}

fn emit(method: &Method, found: Vec<Found>) {
    let context = method.context;
    let mut groups: BTreeMap<(&str, String, u8), &Found> = BTreeMap::new();
    let mut order = Vec::new();
    for finding in &found {
        let key = (finding.pattern, finding.name.clone(), if finding.pattern == SHADOWS { 0 } else { finding.priority });
        match groups.get(&key) {
            Some(known) if known.priority <= finding.priority => {}
            _ => {
                if !groups.contains_key(&key) {
                    order.push(key.clone());
                }
                groups.insert(key, finding);
            }
        }
    }
    let low = std::env::var("NP_SB_LOW").is_ok();
    for key in order {
        let finding = groups[&key];
        if finding.priority > if low { 3 } else { 2 } {
            continue;
        }
        let (label, name) = (method.label, &finding.name);
        let line = line(context, finding.node);
        let (message, arguments) = match finding.pattern {
            STORE => (format!("Dead store to {name} in {label}"), vec![name.clone(), label.to_string()]),
            SHADOWS => (format!("Dead store to {name} rather than field with same name in {label}"), vec![name.clone(), label.to_string()]),
            NULL => (format!("Dead store of null to {name} in {label}"), vec![name.clone(), label.to_string()]),
            CLASS => {
                let class = literal(method, finding.node);
                (format!("Dead store of {class}.class in {label}"), vec![class, label.to_string()])
            }
            RETURN => (format!("Useless increment in return from {label}"), vec![label.to_string()]),
            _ => (format!("The parameter {name} to {label} is dead upon entry but overwritten"), vec![name.clone(), label.to_string()]),
        };
        let shown = if name.starts_with("$L") { "?" } else { name };
        context.report_listed(finding.pattern, finding.node, line, message, place::variable(label, shown), finding.priority, arguments);
    }
}

fn line(context: &Context, node: Node) -> usize {
    match node.kind() {
        "enhanced_for_statement" => context.line(node),
        "variable_declarator" => line_before(context, node, node.end_byte()).max(context.line(node)),
        _ => line_before(context, node, node.end_byte()),
    }
}

/// The class a dead class literal names, as SpotBugs prints it: without `java.lang.`.
fn literal(method: &Method, node: Node) -> String {
    let value = match node.kind() {
        "variable_declarator" => node.child_by_field_name("value"),
        _ => node.child_by_field_name("right"),
    };
    let mut value = value.map(crate::java::flow::cfg::unwrap);
    while let Some(ternary) = value.filter(|value| value.kind() == "ternary_expression") {
        value = ternary.child_by_field_name("alternative").map(crate::java::flow::cfg::unwrap);
    }
    let kind = value.and_then(|value| value.named_child(0)).and_then(|written| method.context.resolver.type_node(written));
    let name = kind.map(|kind| super::super::names::binary(method.context, &kind.erased().name())).unwrap_or_default();
    name.strip_prefix("java.lang.").filter(|rest| !rest.contains('.')).map(String::from).unwrap_or(name)
}

/// The name SpotBugs gives a variable: `$L` and the slot where the compiled code's table of names has no entry
/// for the place right after the store.
fn name(method: &Method, fate: &Fate, var: &Var) -> String {
    if covered(method, fate, var) { var.name.clone() } else { format!("$L{}", var.slot) }
}

fn covered(method: &Method, fate: &Fate, var: &Var) -> bool {
    let node = fate.node;
    match var.kind {
        Kind::Parameter | Kind::Catch | Kind::Resource | Kind::Pattern => true,
        Kind::Each => node.child_by_field_name("body").is_some_and(emits),
        Kind::Local if node.kind() == "variable_declarator" => {
            let later = std::iter::successors(node.next_named_sibling(), |next| next.next_named_sibling());
            if later.filter(|next| next.kind() == "variable_declarator").any(|next| next.child_by_field_name("value").is_some()) {
                return true;
            }
            let Some(statement) = parent(node) else { return true };
            !closes(method, fate.var, statement, parent(statement), true)
        }
        Kind::Local => {
            let Some(statement) = crate::engine::source::ancestor(node, &["expression_statement"]) else { return true };
            let assigned = method.live.fates.values().any(|other| {
                other.var == fate.var && other.node.start_byte() < node.start_byte() && parent(statement_of(other.node)).is_some_and(|block| block.start_byte() <= node.start_byte() && node.end_byte() <= block.end_byte())
            });
            let declared = var.decl.child_by_field_name("value").is_some();
            assigned || declared || !closes(method, fate.var, statement, None, false)
        }
    }
}

fn statement_of(node: Node) -> Node {
    crate::engine::source::ancestor(node, &["expression_statement", "local_variable_declaration"]).unwrap_or(node)
}

/// Whether nothing of the variable's range runs after a statement: no code follows it before its block ends,
/// and the block it is in is not the method's body, and the way out of it is not a jump that still counts.
fn closes(method: &Method, var: usize, mut statement: Node, scope: Option<Node>, declared: bool) -> bool {
    loop {
        let Some(holder) = parent(statement) else { return false };
        match holder.kind() {
            "block" | "switch_block_statement_group" | "constructor_body" => {
                let after = std::iter::successors(statement.next_named_sibling(), |next| next.next_named_sibling());
                if after.into_iter().any(emits) || holder.id() == method.body.id() {
                    return false;
                }
                if declared && Some(holder) == scope {
                    return true;
                }
            }
            "if_statement" => {
                let other = holder.child_by_field_name("alternative");
                let then = holder.child_by_field_name("consequence");
                if then.is_some_and(|then| then.id() == statement.id()) {
                    return other.is_none();
                }
                return !then.is_some_and(|then| stores_in(method, var, then));
            }
            "while_statement" | "for_statement" | "do_statement" | "enhanced_for_statement" => return false,
            "labeled_statement" => {}
            _ => return false,
        }
        statement = holder;
    }
}

fn stores_in(method: &Method, var: usize, node: Node) -> bool {
    method.live.fates.values().any(|fate| fate.var == var && node.start_byte() <= fate.node.start_byte() && fate.node.end_byte() <= node.end_byte())
}

/// Whether a statement makes any code.
pub(super) fn emits(node: Node) -> bool {
    match node.kind() {
        "block" => named_children(node).into_iter().any(emits),
        "local_variable_declaration" => named_children(node).into_iter().any(|part| part.kind() == "variable_declarator" && part.child_by_field_name("value").is_some()),
        "empty_statement" | "line_comment" | "block_comment" | "class_declaration" | "record_declaration" | "enum_declaration" | "interface_declaration" => false,
        "labeled_statement" => named_children(node).into_iter().filter(|part| part.kind() != "identifier").any(emits),
        ";" => false,
        _ => true,
    }
}
