//! FindBadCast2 rebuilt from what SpotBugs 4.9.8 reports on test code. Each cast and `instanceof` of a method,
//! constructor or static initializer is judged by the fact `flow` gives its operand (`facts`), by `judge`:
//! - Known null: NP_NULL_INSTANCEOF. A subtype of the tested type: BC_VACUOUS_INSTANCEOF. A type no value of which
//!   can be the target (an exact type from `new`, a final class, an array, two unrelated classes):
//!   BC_IMPOSSIBLE_INSTANCEOF, BC_IMPOSSIBLE_CAST, BC_IMPOSSIBLE_DOWNCAST, BC_IMPOSSIBLE_DOWNCAST_OF_TOARRAY.
//! - Other downcasts: BC_BAD_CAST_TO_ABSTRACT_COLLECTION, BC_BAD_CAST_TO_CONCRETE_COLLECTION, BC_UNCONFIRMED_CAST,
//!   BC_UNCONFIRMED_CAST_OF_RETURN_VALUE, with priorities from the value's source, the method's visibility and
//!   the classes of the run; an earlier cast of the same value to the same type silences one, an earlier
//!   `instanceof` of it to the target lowers it by two, two or more to other types by one, and a `try` that catches
//!   `ClassCastException` silences it.
//! - Lambda bodies, instance initializers, array elements, `Object` sources and results of static or private
//!   methods are left out.
mod facts;
mod flow;
mod judge;

use super::{Context, names, nulls::redundant::line_before, place};
use crate::engine::source::{ancestor, children, named_children, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::expr::unwrap;
use crate::java::types::model::Type;
use facts::Fact;
use std::collections::HashSet;
use tree_sitter::Node;

pub const PATTERNS: &[&str] = &[
    judge::ABSTRACT, judge::CONCRETE, judge::UNCONFIRMED, judge::RETURNED, judge::IMPOSSIBLE, judge::DOWNCAST, judge::TO_ARRAY, judge::NEVER,
    judge::ALWAYS, judge::NULL,
];

pub fn casts<'a>(context: &Context<'a>, class: Node<'a>) {
    if !context.wants(PATTERNS) {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()) else { return };
    let body = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"));
    for member in body.map(place::members).unwrap_or_default() {
        let Some(code) = member.child_by_field_name("body").or_else(|| named_children(member).into_iter().find(|part| part.kind() == "block")) else { continue };
        let label = match member.kind() {
            "method_declaration" | "constructor_declaration" => names::around(context, code),
            "compact_constructor_declaration" => Some(names::method(context, own, class, None)),
            "static_initializer" => {
                let owner = names::binary(context, own);
                Some(format!("{owner}.<static initializer for {}>()", owner.rsplit(['.', '$']).next().unwrap_or_default()))
            }
            _ => None,
        };
        let Some(label) = label else { continue };
        let listed = if member.kind() == "compact_constructor_declaration" { class.child_by_field_name("parameters") } else { member.child_by_field_name("parameters") };
        let (_, generic, _) = context.resolver.wildcards().parameters(listed);
        let declared = listed.map(named_children).unwrap_or_default().into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter"));
        let parameter_names: Vec<String> = declared.filter_map(parameter_name).map(|name| context.text(name).to_string()).collect();
        let parameters: Vec<(String, Type)> = parameter_names.into_iter().zip(generic).collect();
        let mut locals: HashSet<String> = parameters.iter().map(|(name, _)| name.clone()).collect();
        walk(code, |node| {
            let named = matches!(node.kind(), "variable_declarator" | "catch_formal_parameter" | "enhanced_for_statement" | "resource" | "instanceof_expression");
            if let Some(name) = node.child_by_field_name("name").filter(|_| named) {
                locals.insert(context.text(name).to_string());
            }
        });
        let instance = !(member.kind() == "static_initializer" || has_modifier(member, "static"));
        let unit = flow::Unit { body: code, parameters, own: own.clone(), instance, locals };
        let at = judge::Where { public: judge::public(class, member) };
        report(context, &unit, &at, &label);
    }
}

fn parameter_name(part: Node) -> Option<Node> {
    part.child_by_field_name("name").or_else(|| named_children(part).into_iter().find(|inner| inner.kind() == "variable_declarator")?.child_by_field_name("name"))
}

/// The cast or test as source text with its erased target, to find earlier ones of the same value.
fn key(context: &Context, node: Node) -> Option<(String, String)> {
    let (operand, target) = match node.kind() {
        "cast_expression" => (node.child_by_field_name("value")?, node.child_by_field_name("type")?),
        _ => (node.child_by_field_name("left")?, node.child_by_field_name("right")?),
    };
    Some((context.text(unwrap(operand)).to_string(), context.resolver.type_node(target)?.erased().name()))
}

/// Whether a `try` around the node inside the body catches `ClassCastException`.
fn protected(context: &Context, node: Node, body: Node) -> bool {
    let mut at = ancestor(node, &["try_statement", "try_with_resources_statement"]);
    while let Some(statement) = at.filter(|statement| statement.start_byte() >= body.start_byte()) {
        let inside = statement.child_by_field_name("body").is_some_and(|block| block.start_byte() <= node.start_byte() && node.end_byte() <= block.end_byte());
        let catches = children(statement).into_iter().filter(|part| part.kind() == "catch_clause").any(|clause| {
            let mut found = false;
            walk(clause, |part| {
                if part.kind() == "catch_type" {
                    found |= named_children(part).into_iter().any(|written| context.resolver.type_node(written).is_some_and(|kind| kind.erased().name() == "java.lang.ClassCastException"));
                }
            });
            found
        });
        if inside && catches {
            return true;
        }
        at = ancestor(statement, &["try_statement", "try_with_resources_statement"]);
    }
    false
}

fn strip(shown: String) -> String {
    shown.strip_prefix("java.lang.").map(str::to_string).unwrap_or(shown)
}

fn report(context: &Context, unit: &flow::Unit, at: &judge::Where, label: &str) {
    let limit = if std::env::var("NP_SB_LOW").is_ok() { 3 } else { 2 };
    let checks = flow::checks(context, unit);
    let mut earlier: Vec<(usize, bool, (String, String))> = Vec::new();
    walk(unit.body, |node| {
        let nested = ancestor(node, &["lambda_expression", "class_body"]).is_some_and(|nested| nested.start_byte() > unit.body.start_byte());
        if !nested && matches!(node.kind(), "cast_expression" | "instanceof_expression") {
            earlier.extend(key(context, node).map(|key| (node.start_byte(), node.kind() == "cast_expression", key)));
        }
    });
    let mut seen = HashSet::new();
    for (node, fact) in checks {
        let Some(fact) = fact else { continue };
        let written = match node.kind() {
            "cast_expression" => node.child_by_field_name("type"),
            _ => node.child_by_field_name("right").or_else(|| node.child_by_field_name("pattern").and_then(|pattern| pattern.named_child(0))),
        };
        let Some(target) = written.and_then(|written| context.resolver.type_node(written)).map(|kind| kind.erased()) else { continue };
        if matches!(target, Type::Primitive(_)) {
            continue;
        }
        let verdict = if node.kind() == "cast_expression" {
            let key = key(context, node);
            let before = |cast: bool| earlier.iter().any(|(start, is_cast, other)| *start < node.start_byte() && *is_cast == cast && Some(other) == key.as_ref());
            if before(true) {
                continue;
            }
            let tested = |other: &(String, String)| key.as_ref().is_some_and(|key| key.0 == other.0 && key.1 != other.1);
            let others = earlier.iter().filter(|(start, is_cast, other)| *start < node.start_byte() && !*is_cast && tested(other)).count();
            let checks = judge::Checks { confirmed: before(false), others, protected: protected(context, node, unit.body) };
            judge::cast(context, &fact, &target, at, &checks)
        } else {
            judge::instanceof(context, &fact, &target)
        };
        let Some(verdict) = verdict.filter(|verdict| verdict.priority <= limit) else { continue };
        let source = strip(format!("{}{}", facts::printed(context, &fact.kind), fact.arguments.clone().unwrap_or_default()));
        let wanted = strip(facts::printed(context, &target));
        let (message, arguments) = match verdict.pattern {
            judge::ABSTRACT => (format!("Questionable cast from Collection to abstract class {wanted} in {label}"), vec![wanted.clone(), label.to_string()]),
            judge::CONCRETE => (format!("Questionable cast from {source} to {wanted} in {label}"), vec![source, wanted, label.to_string()]),
            judge::UNCONFIRMED => (format!("Unchecked/unconfirmed cast from {source} to {wanted} in {label}"), vec![source, wanted, label.to_string()]),
            judge::RETURNED => (format!("Unchecked/unconfirmed cast from {source} to {wanted} of return value in {label}"), vec![source, wanted, label.to_string()]),
            judge::IMPOSSIBLE => (format!("Impossible cast from {source} to {wanted} in {label}"), vec![source, wanted, label.to_string()]),
            judge::DOWNCAST => (format!("Impossible downcast from {source} to {wanted} in {label}"), vec![source, wanted, label.to_string()]),
            judge::TO_ARRAY => (format!("Impossible downcast of toArray() result to {wanted} in {label}"), vec![wanted, label.to_string()]),
            judge::NEVER => (format!("instanceof will always return false in {label}, since a {source} cannot be a {wanted}"), vec![label.to_string(), source, wanted]),
            judge::ALWAYS => (format!("instanceof will always return true for all non-null values in {label}, since all {source} are instances of {wanted}"), vec![label.to_string(), source, wanted]),
            _ => (format!("A known null value is checked to see if it is an instance of {wanted} in {label}"), vec![wanted, label.to_string()]),
        };
        let place = place_of(context, label, node, &fact, verdict.pattern);
        let line = line_before(context, node, node.end_byte());
        if seen.insert((verdict.pattern, line, message.clone(), place.clone())) {
            context.report_listed(verdict.pattern, node, line, message, place, verdict.priority, arguments);
        }
    }
}

/// The SARIF place: the method for tests that always or never hold on a known value; else the called method for a
/// value straight from a call, the method for an array that did not come from one, the local that holds the value,
/// or the field it was read from.
fn place_of(context: &Context, label: &str, node: Node, fact: &Fact, pattern: &str) -> String {
    let mut operand = node.child_by_field_name("value").or_else(|| node.child_by_field_name("left")).map(unwrap);
    while let Some(inner) = operand.filter(|inner| inner.kind() == "cast_expression") {
        operand = inner.child_by_field_name("value").map(unwrap);
    }
    if matches!(pattern, judge::ALWAYS | judge::NULL) {
        return place::function(label);
    }
    if let Some(callee) = fact.callee.as_ref().filter(|_| operand.is_some_and(|operand| operand.kind() == "method_invocation")) {
        return place::function(callee);
    }
    if let Some(created) = operand.filter(|operand| operand.kind() == "object_creation_expression").and_then(|operand| creator(context, operand)) {
        return place::function(&created);
    }
    if matches!(fact.kind, Type::Array(_)) && fact.origin != facts::Origin::Returned {
        return place::function(label);
    }
    match (&fact.holder, operand) {
        (Some(_), Some(operand)) if looped(context, operand) => place::variable(label, context.text(operand)),
        (Some(holder), _) => place::variable(label, holder),
        (None, Some(operand)) => member(context, operand).unwrap_or_else(|| place::value(context, label, operand)),
        (None, None) => place::function(label),
    }
}

/// Whether a local read in a loop is stored again in that loop: SpotBugs then sees a value of its own there, whatever
/// value it copied before.
fn looped(context: &Context, operand: Node) -> bool {
    const LOOPS: &[&str] = &["while_statement", "do_statement", "for_statement", "enhanced_for_statement"];
    if operand.kind() != "identifier" {
        return false;
    }
    let name = context.text(operand);
    let Some(around) = crate::engine::source::ancestor(operand, LOOPS) else { return false };
    let mut stored = false;
    crate::engine::source::walk(around, |node| {
        let left = node.child_by_field_name("left").filter(|_| node.kind() == "assignment_expression").map(unwrap);
        stored |= left.is_some_and(|left| left.kind() == "identifier" && context.text(left) == name);
    });
    stored
}

/// The constructor a `new` calls, as SpotBugs names it: `new Class(A, B)`, without `java.lang.`.
fn creator(context: &Context, creation: Node) -> Option<String> {
    let found = context.resolver.resolve_constructor(creation)?;
    let binary = names::binary(context, &found.declaring);
    let written = binary.strip_prefix("java.lang.").filter(|rest| !rest.contains('.')).unwrap_or(&binary);
    let parameters: Vec<String> = found.method.parameters.iter().map(|kind| names::simple(context, kind)).collect();
    Some(format!("new {written}({})", parameters.join(", ")))
}

/// A field read: SpotBugs names it under the class of the method that reads it, and shows the class that declares
/// it after `@`, as seen from the class it is read through.
fn member(context: &Context, operand: Node) -> Option<String> {
    let (declaring, name) = super::fields::field_key(context, operand)?;
    let own = crate::java::types::scope::enclosing_types(context.resolver.scope, operand).into_iter().next()?;
    let through = match operand.kind() {
        "field_access" => match operand.child_by_field_name("object")? {
            object if object.kind() == "this" => own.clone(),
            object => context.resolver.type_of(object).map(|kind| kind.erased().name())?,
        },
        _ => crate::java::types::scope::enclosing_types(context.resolver.scope, operand)
            .into_iter()
            .find(|class| context.resolver.index.field(class, &name).is_some_and(|(info, _)| info.name == declaring))?,
    };
    let shown = names::field(context, &through, &declaring, &name);
    Some(format!("member:{}.{name}@{shown}", names::binary(context, &own)))
}
