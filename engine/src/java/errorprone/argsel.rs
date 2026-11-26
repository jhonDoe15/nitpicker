//! ArgumentSelectionDefectChecker: arguments whose names fit the parameters of another position better than their own.
use super::Context;
use super::argsel_algo::{Hungarian, convert_to_lower_underscore, normalized_edit_distance, split_to_lowercase_terms};
use super::argsel_heuristics::{creates_no_duplicate, improves_enough, names_say_enough, not_in_reverse, not_named_by_comment};
use super::argsel_types::assignable;
use super::fixes::Fix;
use super::hierarchy::{declared_method, has_annotation, simple_name};
use crate::engine::source::{ancestor, children, named_children, parent};
use crate::java::types::expr::Call;
use crate::java::types::model::{Type, flag};
use crate::java::types::scope::{Resolver, enclosing_types, type_parameter};
use tree_sitter::Node;

const NAME: &str = "ArgumentSelectionDefectChecker";
const NULL: &str = "*NULL*";
const NOT_PRESENT: &str = "*NOT_PRESENT*";
const ASSERT_CLASSES: [&str; 3] = ["org.junit.Assert", "junit.framework.TestCase", "junit.framework.Assert"];

pub struct Invocation<'t> {
    pub node: Node<'t>,
    pub call: Call,
    pub formal_names: Vec<String>,
    pub formal_types: Vec<Type>,
    pub arguments: Vec<Node<'t>>,
    pub actuals: Vec<Node<'t>>,
    pub comment_start: usize,
    /// The names of the actuals when they are not read from the expressions, and their types: variables of a pattern.
    pub bound: Option<Vec<(String, Option<Type>)>>,
}

/// The formals that change, each with the actual that goes in its place, and the cost of both.
pub struct Changes {
    pub pairs: Vec<(usize, usize)>,
    pub original: Vec<f64>,
    pub assigned: Vec<f64>,
}

fn class_name_of(context: &Context, at: Node) -> String {
    let mut current = parent(at);
    while let Some(node) = current {
        match node.kind() {
            "class_body" if parent(node).is_some_and(|holder| holder.kind() == "object_creation_expression") => {
                let creation = parent(node).unwrap_or(node);
                return anonymous_super(context, creation);
            }
            "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration" => {
                return node.child_by_field_name("name").map(|name| context.text(name).to_string()).unwrap_or_default();
            }
            _ => {}
        }
        current = parent(node);
    }
    NOT_PRESENT.to_string()
}

/// The simple name of what an anonymous class extends: `Object` when it implements an interface.
fn anonymous_super(context: &Context, creation: Node) -> String {
    let created = creation.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind));
    match created {
        Some(Type::Class(name, _)) if context.resolver.index.get(&name).is_some_and(|info| !info.is_interface) => simple_name(&name).to_string(),
        Some(Type::Class(..)) => "Object".to_string(),
        _ => NOT_PRESENT.to_string(),
    }
}

fn created_name(context: &Context, creation: Node) -> String {
    if children(creation).iter().any(|part| part.kind() == "class_body") {
        return anonymous_super(context, creation);
    }
    let Some(kind) = creation.child_by_field_name("type") else { return NOT_PRESENT.to_string() };
    let written = context.text(kind);
    let base = written.split('<').next().unwrap_or(written);
    base.rsplit('.').next().unwrap_or(base).trim().to_string()
}

/// Error Prone's `Parameter.getArgumentName` for an argument.
fn argument_name(context: &Context, tree: Node) -> String {
    match tree.kind() {
        "field_access" => tree.child_by_field_name("field").map(|field| context.text(field).to_string()).unwrap_or_else(|| NOT_PRESENT.to_string()),
        "class_literal" => "class".to_string(),
        "null_literal" => NULL.to_string(),
        "identifier" => context.text(tree).to_string(),
        "this" => class_name_of(context, tree),
        "object_creation_expression" => created_name(context, tree),
        "method_invocation" => invocation_name(context, tree),
        _ => NOT_PRESENT.to_string(),
    }
}

fn invocation_name(context: &Context, call: Node) -> String {
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return NOT_PRESENT.to_string() };
    let terms = split_to_lowercase_terms(name);
    let Some(first) = terms.first().filter(|first| matches!(first.as_str(), "get" | "set" | "is")) else { return name.to_string() };
    if terms.len() > 1 {
        return name.chars().skip(first.chars().count()).collect();
    }
    match call.child_by_field_name("object") {
        Some(receiver) => argument_name(context, receiver),
        None => match context.resolver.resolve_call(call) {
            Some(resolved) => simple_name(&resolved.declaring).to_string(),
            None => NOT_PRESENT.to_string(),
        },
    }
}

fn distance(formal: &str, formal_index: usize, actual: &str, actual_index: usize) -> f64 {
    if actual == NULL {
        return 0.0;
    }
    if actual != NOT_PRESENT {
        return normalized_edit_distance(&convert_to_lower_underscore(formal), &convert_to_lower_underscore(actual), 8, 8, 1);
    }
    if formal_index == actual_index { 0.0 } else { f64::INFINITY }
}

fn assert_method(context: &Context, node: Node, call: &Call) -> bool {
    let name = call.method.name.as_str();
    if node.kind() != "method_invocation" || !call.method.is_static || !name.starts_with("assert") {
        return false;
    }
    let owner = match node.child_by_field_name("object") {
        Some(_) => call.receiver.erased().name(),
        None => call.declaring.clone(),
    };
    if !ASSERT_CLASSES.contains(&owner.as_str()) {
        return false;
    }
    let formals = &call.method.generic_parameters;
    let shaped = match formals.len() {
        2 => formals[0] == formals[1],
        3 => formals[0] == Type::class("java.lang.String") && formals[1] == formals[2],
        _ => false,
    };
    let throwable = node
        .child_by_field_name("arguments")
        .map(named_children)
        .unwrap_or_default()
        .into_iter()
        .filter(|argument| !argument.kind().ends_with("comment"))
        .any(|argument| context.resolver.type_of(argument).is_some_and(|kind| matches!(kind, Type::Class(..)) && context.resolver.index.is_subtype(&kind.name(), "java.lang.Throwable")));
    let template = ancestor(node, &["method_declaration"]).is_some_and(|method| has_annotation(context, method, "BeforeTemplate"));
    shaped && !throwable && !template
}

fn auto_value_constructor(context: &Context, node: Node, call: &Call) -> bool {
    node.kind() == "object_creation_expression"
        && context.resolver.index.get(&call.declaring).and_then(|info| info.superclass.as_ref()).and_then(|name| context.resolver.index.get(name)).is_some_and(|info| info.flags & flag::AUTO_VALUE != 0)
}

fn invocation<'t>(context: &Context, node: Node<'t>) -> Option<Invocation<'t>> {
    if node.kind() == "record_pattern" {
        return pattern_invocation(context, node).filter(|found| found.formal_names.len() > 1);
    }
    let list = node.child_by_field_name("arguments")?;
    if matches!(node.kind(), "object_creation_expression" | "enum_constant") && children(node).iter().any(|part| matches!(part.kind(), "class_body" | "enum_body")) {
        return None;
    }
    let arguments: Vec<Node> = named_children(list).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    if arguments.len() < 2 || arguments.iter().filter(|argument| argument_name(context, **argument) != NOT_PRESENT).count() < 2 {
        return None;
    }
    let call = match node.kind() {
        "method_invocation" => context.resolver.resolve_call(node)?,
        _ => context.resolver.call_formals(node)?.0,
    };
    if assert_method(context, node, &call) || auto_value_constructor(context, node, &call) {
        return None;
    }
    let count = call.method.parameters.len() - usize::from(call.method.varargs);
    let names = &call.method.names;
    let formal_names: Vec<String> = (0..count).map(|at| if names.len() == call.method.parameters.len() { names[at].clone() } else { format!("arg{at}") }).collect();
    if names.len() > call.method.parameters.len() || formal_names.first().is_some_and(|first| first.starts_with("this$") && first[5..].bytes().all(|digit| digit.is_ascii_digit()) && first.len() > 5) {
        return None;
    }
    if count <= 1 || arguments.len() < count || call.method.generic_parameters.len() < count {
        return None;
    }
    let formal_types = call.method.generic_parameters[..count].to_vec();
    let comment_start = match node.kind() {
        "method_invocation" => node.child_by_field_name("name")?.end_byte(),
        "explicit_constructor_invocation" => node.child_by_field_name("constructor")?.end_byte(),
        _ => node.start_byte(),
    };
    let actuals = arguments[..count].to_vec();
    Some(Invocation { node, call, formal_names, formal_types, arguments, actuals, comment_start, bound: None })
}

fn pattern_invocation<'t>(context: &Context, node: Node<'t>) -> Option<Invocation<'t>> {
    let deconstructor = node.named_child(0).filter(|part| matches!(part.kind(), "identifier" | "generic_type"))?;
    let body = children(node).into_iter().find(|part| part.kind() == "record_pattern_body")?;
    let nested: Vec<Node> = named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let Type::Class(class, _) = context.resolver.type_node(deconstructor)? else { return None };
    let info = context.resolver.index.get(&class)?;
    let components = info.record_components.as_ref()?;
    let erased: Vec<Type> = components.iter().map(Type::erased).collect();
    let canonical = info.methods.iter().find(|method| method.name == "<init>" && method.parameters == erased)?;
    let call = Call { raw: false, receiver: Type::class(&class), declaring: class.clone(), method: canonical.clone() };
    let (mut formal_names, mut formal_types, mut actuals, mut bound) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    for (at, pattern) in nested.iter().enumerate().take(components.len()) {
        let parts: Vec<Node> = named_children(*pattern).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
        let [written, name] = parts.as_slice() else { continue };
        if pattern.kind() != "record_pattern_component" || name.kind() != "identifier" {
            continue;
        }
        formal_names.push(canonical.names.get(at).cloned().unwrap_or_else(|| format!("arg{at}")));
        formal_types.push(canonical.generic_parameters.get(at)?.clone());
        let declared = if context.text(*written) == "var" { Some(canonical.parameters[at].clone()) } else { context.resolver.type_node(*written) };
        bound.push((context.text(*name).to_string(), declared));
        actuals.push(*pattern);
    }
    Some(Invocation { node, call, formal_names, formal_types, arguments: nested, actuals, comment_start: deconstructor.end_byte(), bound: Some(bound) })
}

fn matrix(inv: &Invocation, actual_names: &[String]) -> Vec<Vec<f64>> {
    let count = inv.formal_names.len();
    (0..count).map(|i| (0..count).map(|j| distance(&inv.formal_names[i], i, &actual_names[j], j)).collect()).collect()
}

/// An unconstrained assignment that is not much cheaper than the arguments as they stand rules every change out.
fn promising(matrix: &[Vec<f64>]) -> bool {
    let assignment = Hungarian::new(matrix).execute();
    let own: f64 = (0..matrix.len()).map(|at| matrix[at][at]).sum();
    let best: f64 = assignment.iter().enumerate().map(|(row, column)| matrix[row][*column as usize]).sum();
    own - best >= 2.0 * 0.6 - 0.01
}

/// Whether the type variable of that name at the call is the callee's own: a call inside the method or the class that declares it.
fn own_variable(context: &Context, inv: &Invocation, name: &str) -> bool {
    let in_method = type_parameter(context.file, inv.node, name)
        .and_then(|declared| parent(declared).and_then(parent))
        .is_some_and(|owner| matches!(owner.kind(), "method_declaration" | "constructor_declaration"));
    if inv.call.method.type_parameters.iter().any(|own| own == name) {
        let kinds = ["method_declaration", "constructor_declaration", "compact_constructor_declaration"];
        let inside = ancestor(inv.node, &kinds).and_then(|method| declared_method(context, method)).is_some_and(|(owner, method)| {
            owner.name == inv.call.declaring && method.name == inv.call.method.name && method.parameters == inv.call.method.parameters
        });
        return in_method && inside;
    }
    !in_method && enclosing_types(context.resolver.scope, inv.node).iter().any(|owner| *owner == inv.call.declaring)
}

fn fits(context: &Context, symbolic_resolver: &Resolver, inv: &Invocation, formal: usize, actual: usize) -> bool {
    let argument = inv.actuals[actual];
    if let Some(bound) = &inv.bound {
        let Some(kind) = &bound[actual].1 else { return false };
        return assignable(context.resolver.index, &|name| own_variable(context, inv, name), kind, kind, &inv.formal_types[formal]);
    }
    let Some(kind) = context.resolver.type_of(argument) else { return false };
    let symbolic = symbolic_resolver.type_of(argument).unwrap_or_else(|| kind.clone());
    assignable(context.resolver.index, &|name| own_variable(context, inv, name), &symbolic, &kind, &inv.formal_types[formal])
}

fn find_changes(context: &Context, inv: &Invocation) -> Option<Changes> {
    let count = inv.formal_names.len();
    let actual_names: Vec<String> = match &inv.bound {
        Some(bound) => bound.iter().map(|(name, _)| name.clone()).collect(),
        None => inv.actuals.iter().map(|argument| argument_name(context, *argument)).collect(),
    };
    let mut costs = matrix(inv, &actual_names);
    if !promising(&costs) {
        return None;
    }
    let symbolic = context.resolver.symbolic();
    let mut viable = false;
    for i in 0..count {
        for j in 0..count {
            if i != j {
                if actual_names[j] != NOT_PRESENT && !fits(context, &symbolic, inv, i, j) {
                    costs[i][j] = f64::INFINITY;
                } else {
                    viable |= costs[i][j].is_finite() || actual_names[j] == NOT_PRESENT;
                }
            }
        }
    }
    if !viable {
        return None;
    }
    let assignment = Hungarian::new(&costs).execute();
    let changed: Vec<usize> = (0..count).filter(|row| assignment[*row] != *row as i64).collect();
    if changed.is_empty() {
        return None;
    }
    let pairs: Vec<(usize, usize)> = changed.iter().map(|row| (*row, assignment[*row] as usize)).collect();
    let original = changed.iter().map(|row| costs[*row][*row]).collect();
    let assigned = changed.iter().map(|row| costs[*row][assignment[*row] as usize]).collect();
    Some(Changes { pairs, original, assigned })
}

fn message(context: &Context, inv: &Invocation, changes: &Changes) -> String {
    let parts: Vec<String> = changes.pairs.iter().map(|(formal, _)| format!("'{}' for formal parameter '{}'", context.text(inv.actuals[*formal]), inv.formal_names[*formal])).collect();
    format!("The following arguments may have been swapped: {}. Either add clarifying `/* paramName= */` comments, or swap the arguments if that is what was intended", parts.join(", "))
}

fn report(context: &Context, inv: &Invocation, changes: &Changes) {
    let mut commented = Fix::new();
    let mut permuted = Fix::new();
    for (formal, actual) in &changes.pairs {
        let target = inv.actuals[*formal];
        commented = commented.and(target.start_byte(), target.start_byte(), format!("/* {}= */", inv.formal_names[*formal]));
        permuted = permuted.and(target.start_byte(), target.end_byte(), context.text(inv.actuals[*actual]));
    }
    let at = match inv.node.kind() {
        "object_creation_expression" => children(inv.node).into_iter().find(|part| part.kind() == "new").map_or(inv.node.start_byte(), |keyword| keyword.start_byte()),
        "enum_constant" | "record_pattern" => inv.node.start_byte(),
        _ => inv.node.child_by_field_name("arguments").map_or(inv.node.start_byte(), |list| list.start_byte()),
    };
    context.report_fixed(NAME, inv.node, at, &message(context, inv, changes), &[commented, permuted]);
}

pub fn argument_selection_defect(context: &Context, node: Node) {
    if !matches!(node.kind(), "method_invocation" | "object_creation_expression" | "explicit_constructor_invocation" | "enum_constant" | "record_pattern") {
        return;
    }
    let Some(inv) = invocation(context, node) else { return };
    let Some(changes) = find_changes(context, &inv) else { return };
    let accepted = names_say_enough(&inv, &changes)
        && improves_enough(&changes)
        && not_in_reverse(context, node)
        && creates_no_duplicate(context, &inv, &changes)
        && not_named_by_comment(context, &inv, &changes);
    if accepted {
        report(context, &inv, &changes);
    }
}
