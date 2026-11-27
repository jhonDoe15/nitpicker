//! FindLocalSelfAssignment2 rebuilt from what SpotBugs 4.9.8 reports on test code:
//! - `x = x;` as a statement (or a `for` init or update), where `x` is a local variable, a pattern variable or a
//!   parameter of the method, constructor or lambda it is in, is SA_LOCAL_SELF_ASSIGNMENT; a catch parameter only
//!   when the handler reads it later. A name the method's own class declares as a field makes it
//!   SA_LOCAL_SELF_ASSIGNMENT_INSTEAD_OF_FIELD: any field in an instance method, constructor or lambda that uses
//!   `this`, a static field in static code.
//!   Fields of superclasses and outer classes do not count.
//! - Priority 1 in a constructor, and for a parameter no store instruction writes before it in code order (`++`, and
//!   `+=` or `-=` of a constant javac writes as `iinc` on an `int`, do not store); else 2.
//! - Every self assignment is a finding of its own; in a method two with the same name, priority and line make one,
//!   in a constructor two with the same name.
//! - Instance initializer blocks and instance field initializers are copied into every constructor that does not
//!   start with `this(...)`, and reported in each; static ones belong to the static initializer.
use super::{lambdas, nested};
use super::super::{Context, folds, names, nulls::redundant::line_before, place, sequence::runs_at};
use crate::engine::source::{ancestor, children, named_children, parent};
use crate::java::flow::cfg::unwrap;
use crate::java::helpers::has_modifier;
use crate::java::types::expr::Binding;
use crate::java::types::model::{Type, flag};
use std::collections::HashSet;
use tree_sitter::Node;

pub const SELF: &str = "SA_LOCAL_SELF_ASSIGNMENT";
pub const INSTEAD_OF_FIELD: &str = "SA_LOCAL_SELF_ASSIGNMENT_INSTEAD_OF_FIELD";

/// A method as the compiled code has it: a member of the class, the constructors an initializer is copied into,
/// or the hidden method of a lambda.
struct Unit<'a> {
    node: Node<'a>,
    labels: Vec<String>,
    parameters: Vec<String>,
    instance: bool,
    constructor: bool,
}

struct Found<'a> {
    pattern: &'static str,
    at: Node<'a>,
    name: String,
    priority: u8,
    label: String,
    constructor: bool,
}

pub fn member<'a>(context: &Context<'a>, own: &str, class: Node<'a>, member: Node<'a>) {
    let kind = member.kind();
    let fixed = kind == "static_initializer" || has_modifier(member, "static") || (kind == "field_declaration" && interface(class));
    let unit = match kind {
        "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" => {
            let constructor = kind != "method_declaration";
            Unit { node: member, labels: vec![label(context, own, class, member)], parameters: listed(context, class, member), instance: !fixed, constructor }
        }
        "static_initializer" | "field_declaration" | "block" if fixed => Unit { node: member, labels: vec![clinit(context, own)], parameters: Vec::new(), instance: false, constructor: false },
        "field_declaration" | "block" => Unit { node: member, labels: constructors(context, own, class), parameters: Vec::new(), instance: true, constructor: true },
        _ => return,
    };
    let mut found = Vec::new();
    walk(context, own, member, &unit, fixed, &mut found);
    let mut seen = HashSet::new();
    for finding in found {
        let line = line_before(context, finding.at, finding.at.end_byte());
        let key = (finding.pattern, finding.name.clone(), finding.priority, if finding.constructor { 0 } else { line }, finding.label.clone());
        if !seen.insert(key) {
            continue;
        }
        let (name, label) = (finding.name, finding.label);
        let message = match finding.pattern {
            SELF => format!("Self assignment of {name} in {label}"),
            _ => format!("Self assignment of {name} rather than assigned to field in {label}"),
        };
        context.report_listed(finding.pattern, finding.at, line, message, place::variable(&label, &name), finding.priority, vec![name, label]);
    }
}

fn interface(class: Node) -> bool {
    matches!(class.kind(), "interface_declaration" | "annotation_type_declaration")
}

fn walk<'a>(context: &Context<'a>, own: &str, node: Node<'a>, unit: &Unit<'a>, fixed: bool, found: &mut Vec<Found<'a>>) {
    if nested(node) {
        return;
    }
    if node.kind() == "lambda_expression" {
        let Some(label) = names::lambda(context, node) else { return };
        let instance = !fixed && lambdas::uses_this(context, node);
        let lambda = Unit { node, labels: vec![label], parameters: lambdas::parameters(context, node), instance, constructor: false };
        children(node).into_iter().for_each(|part| walk(context, own, part, &lambda, fixed, found));
        return;
    }
    assigned(context, own, node, unit, found);
    children(node).into_iter().for_each(|part| walk(context, own, part, unit, fixed, found));
}

fn assigned<'a>(context: &Context<'a>, own: &str, node: Node<'a>, unit: &Unit<'a>, found: &mut Vec<Found<'a>>) {
    if node.kind() != "assignment_expression" || node.child_by_field_name("operator").map(|operator| context.text(operator)) != Some("=") || !discarded(node) || unreached(node) {
        return;
    }
    let Some(left) = node.child_by_field_name("left").map(unwrap).filter(|_| same_sides(context, node)) else { return };
    let name = context.text(left).to_string();
    let local = matches!(context.resolver.binding(left, &name), Some(Binding::Local(_)));
    if !(local || pattern_variable(context, unit.node, &name)) || caught(context, node, &name) {
        return;
    }
    let parameter = unit.parameters.contains(&name);
    let priority = if unit.constructor || (parameter && !stored_before(context, unit.node, &name, node)) { 1 } else { 2 };
    let info = context.resolver.index.get(own);
    let field = info.is_some_and(|info| info.fields.iter().any(|field| field.name == name && (unit.instance || field.flags & flag::STATIC != 0)));
    let pattern = if field { INSTEAD_OF_FIELD } else { SELF };
    for label in &unit.labels {
        found.push(Found { pattern, at: node, name: name.clone(), priority, label: label.clone(), constructor: unit.constructor });
    }
}

/// `x = x`: the same plain name on both sides.
fn same_sides(context: &Context, node: Node) -> bool {
    let (Some(left), Some(right)) = (node.child_by_field_name("left").map(unwrap), node.child_by_field_name("right").map(unwrap)) else { return false };
    left.kind() == "identifier" && right.kind() == "identifier" && context.text(left) == context.text(right)
}

/// Whether the value of an assignment is thrown away: a statement of its own, or a `for` init or update.
fn discarded(node: Node) -> bool {
    let mut current = node;
    while let Some(holder) = parent(current).filter(|holder| holder.kind() == "parenthesized_expression") {
        current = holder;
    }
    match parent(current) {
        Some(holder) if holder.kind() == "expression_statement" => true,
        Some(holder) if holder.kind() == "for_statement" => holder.child_by_field_name("condition").is_none_or(|condition| condition.id() != current.id()),
        _ => false,
    }
}

/// A catch parameter's self assignment SpotBugs leaves out: one after which the handler does not read it.
fn caught(context: &Context, node: Node, name: &str) -> bool {
    let mut at = ancestor(node, &["catch_clause", "lambda_expression", "class_body"]);
    while let Some(clause) = at.filter(|clause| clause.kind() == "catch_clause") {
        let parameter = children(clause).into_iter().find(|part| part.kind() == "catch_formal_parameter");
        if parameter.and_then(|parameter| parameter.child_by_field_name("name")).is_some_and(|declared| context.text(declared) == name) {
            let mut read = false;
            crate::engine::source::walk(clause, |part| {
                let own = ancestor(part, &["assignment_expression"]).is_some_and(|assignment| same_sides(context, assignment));
                read |= part.kind() == "identifier" && part.start_byte() >= node.end_byte() && context.text(part) == name && !own;
            });
            return !read;
        }
        at = ancestor(clause, &["catch_clause", "lambda_expression", "class_body"]);
    }
    false
}

/// Whether a pattern of the unit (`instanceof T t`, a `case` pattern, a record pattern) declares the name.
fn pattern_variable(context: &Context, unit: Node, name: &str) -> bool {
    let mut visit = vec![unit];
    while let Some(node) = visit.pop() {
        let declared = match node.kind() {
            "instanceof_expression" => node.child_by_field_name("name"),
            "type_pattern" | "record_pattern_component" => children(node).into_iter().filter(|part| part.kind() == "identifier").last(),
            _ => None,
        };
        if declared.is_some_and(|declared| context.text(declared) == name) {
            return true;
        }
        if node.id() == unit.id() || !(nested(node) || node.kind() == "lambda_expression") {
            visit.extend(children(node));
        }
    }
    false
}

/// Whether the compiled code of the unit stores into the variable before the instruction of `at`.
fn stored_before(context: &Context, unit: Node, name: &str, at: Node) -> bool {
    let mark = runs_at(at);
    let mut visit = vec![unit];
    while let Some(node) = visit.pop() {
        if node.id() != unit.id() && (nested(node) || node.kind() == "lambda_expression") {
            continue;
        }
        if node.id() != at.id() && stores(context, node, name) && runs_at(node) < mark {
            return true;
        }
        visit.extend(children(node));
    }
    false
}

/// Whether a node stores into the variable: an assignment or an update the compiler does not write as `iinc`.
fn stores(context: &Context, node: Node, name: &str) -> bool {
    let written = match node.kind() {
        "assignment_expression" => node.child_by_field_name("left"),
        "update_expression" => named_children(node).into_iter().find(|part| !part.kind().ends_with("comment")),
        _ => None,
    };
    let Some(written) = written.map(unwrap).filter(|written| written.kind() == "identifier" && context.text(*written) == name) else { return false };
    if context.resolver.type_of(written) != Some(Type::Primitive("int")) {
        return true;
    }
    if node.kind() == "update_expression" {
        return false;
    }
    let operator = node.child_by_field_name("operator").map(|operator| context.text(operator));
    let value = node.child_by_field_name("right").and_then(|right| number(context, right));
    let step = match (operator, value) {
        (Some("+="), Some(value)) => value,
        (Some("-="), Some(value)) => -value,
        _ => return true,
    };
    !(-32768..=32767).contains(&step)
}

/// The `int` value javac folds an expression to, a `char` literal and a cast to a whole number type included.
fn number(context: &Context, node: Node) -> Option<i64> {
    let node = unwrap(node);
    match node.kind() {
        "character_literal" => {
            let text = context.text(node);
            let inner = text.strip_prefix('\'')?.strip_suffix('\'')?;
            let mut chars = inner.chars();
            match (chars.next()?, chars.next()) {
                ('\\', Some(escaped)) => Some(match escaped { 'n' => 10, 't' => 9, 'r' => 13, 'b' => 8, 'f' => 12, '0' => 0, other => other as i64 }),
                (single, None) => Some(single as i64),
                _ => None,
            }
        }
        "cast_expression" => {
            let to = node.child_by_field_name("type").map(|written| context.text(written));
            let value = number(context, node.child_by_field_name("value")?)?;
            match to? {
                "int" => Some(value),
                "short" => Some(value as i16 as i64),
                "char" => Some(value as u16 as i64),
                "byte" => Some(value as i8 as i64),
                _ => None,
            }
        }
        _ => folds::number(context, node),
    }
}

/// A `for` update no way reaches: the body always leaves the loop.
fn unreached(node: Node) -> bool {
    let Some(holder) = parent(node).filter(|holder| holder.kind() == "for_statement") else { return false };
    let mut cursor = holder.walk();
    if !holder.children_by_field_name("update", &mut cursor).any(|update| update.id() == node.id()) {
        return false;
    }
    let body = holder.child_by_field_name("body");
    let last = body.map(|body| if body.kind() == "block" { named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).last() } else { Some(body) });
    last.flatten().is_some_and(|last| matches!(last.kind(), "break_statement" | "return_statement" | "throw_statement"))
}

fn label(context: &Context, own: &str, class: Node, member: Node) -> String {
    match member.kind() {
        "compact_constructor_declaration" => names::method(context, own, class, None),
        _ => names::around(context, member.child_by_field_name("body").unwrap_or(member)).unwrap_or_default(),
    }
}

fn clinit(context: &Context, own: &str) -> String {
    let owner = names::binary(context, own);
    let simple = owner.rsplit(['.', '$']).next().unwrap_or_default().to_string();
    format!("{owner}.<static initializer for {simple}>()")
}

/// The constructors javac copies instance initializers into: those that do not start with `this(...)`, or the one it
/// writes when the class declares none.
fn constructors(context: &Context, own: &str, class: Node) -> Vec<String> {
    if class.kind() == "object_creation_expression" {
        return vec![names::anonymous(context, own, class)];
    }
    let declared: Vec<Node> = super::members(class).into_iter().filter(|part| matches!(part.kind(), "constructor_declaration" | "compact_constructor_declaration")).collect();
    if declared.is_empty() {
        let outer = crate::java::javac::instance_around(context.resolver, class);
        return vec![names::method(context, own, class, outer.as_deref())];
    }
    let delegates = |constructor: &Node| {
        let body = constructor.child_by_field_name("body");
        let first = body.and_then(|body| named_children(body).into_iter().find(|part| !part.kind().ends_with("comment")));
        first.is_some_and(|first| first.kind() == "explicit_constructor_invocation" && first.child(0).is_some_and(|call| context.text(call) == "this"))
    };
    declared.iter().filter(|constructor| !delegates(constructor)).map(|constructor| label(context, own, class, *constructor)).collect()
}

fn listed(context: &Context, class: Node, member: Node) -> Vec<String> {
    let list = match member.kind() {
        "compact_constructor_declaration" => class.child_by_field_name("parameters"),
        _ => member.child_by_field_name("parameters"),
    };
    let declared = list.map(named_children).unwrap_or_default();
    let names = declared.into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter"));
    names.filter_map(parameter_name).map(|name| context.text(name).to_string()).collect()
}

pub(super) fn parameter_name(part: Node) -> Option<Node> {
    part.child_by_field_name("name").or_else(|| {
        let declarator = named_children(part).into_iter().find(|inner| inner.kind() == "variable_declarator")?;
        declarator.child_by_field_name("name")
    })
}
