//! ChainingConstructorIgnoresParameter and CheckNotNullMultipleTimes.
use super::Context;
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::hierarchy::{declared_method, formals};
use super::positions::arguments;
use crate::engine::source::{ancestor, children, named_children, parent, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::expr::Binding;
use crate::java::types::model::{Type, flag};
use tree_sitter::Node;

const CHAINING_MESSAGE: &str = "The called constructor accepts a parameter with the same name and type as one of its caller's parameters, but its caller doesn't pass that parameter to it.  It's likely that it was intended to.";

fn parameter_name<'f>(context: &'f Context, parameter: Node) -> Option<&'f str> {
    let holder = if parameter.kind() == "spread_parameter" { children(parameter).into_iter().find(|part| part.kind() == "variable_declarator")? } else { parameter };
    holder.child_by_field_name("name").map(|name| context.text(name))
}

fn parameter_type(context: &Context, parameter: Node) -> Option<Type> {
    if parameter.kind() == "spread_parameter" {
        let element = named_children(parameter).into_iter().find_map(|part| context.resolver.type_node(part))?;
        return Some(Type::Array(Box::new(element)));
    }
    context.resolver.declared_type(parameter, None)
}

/// Whether the tree has a plain identifier of that name: not the member of a field access or the name of a qualified call.
fn references_identifier(context: &Context, name: &str, tree: Node) -> bool {
    let mut found = false;
    walk(tree, |part| {
        if found || part.kind() != "identifier" || context.text(part) != name {
            return;
        }
        let holder = parent(part);
        let member = holder.is_some_and(|holder| match holder.kind() {
            "field_access" => holder.child_by_field_name("field") == Some(part),
            "method_invocation" => holder.child_by_field_name("name") == Some(part) && holder.child_by_field_name("object").is_some(),
            _ => false,
        });
        found = !member;
    });
    found
}

fn callee<'t>(context: &Context, call: Node<'t>) -> Option<Node<'t>> {
    let target = context.resolver.call_formals(call)?.0.method;
    let class = ancestor(call, &["class_declaration", "enum_declaration", "record_declaration"])?;
    let body = class.child_by_field_name("body")?;
    named_children(body).into_iter().filter(|member| member.kind() == "constructor_declaration").find(|constructor| {
        declared_method(context, *constructor).is_some_and(|(_, method)| method.parameters == target.parameters)
    })
}

pub fn chaining_constructor_ignores_parameter(context: &Context, call: Node) {
    if call.kind() != "explicit_constructor_invocation" || call.child_by_field_name("constructor").is_none_or(|constructor| constructor.kind() != "this") {
        return;
    }
    let Some(caller) = ancestor(call, &["constructor_declaration"]) else { return };
    let Some(called) = callee(context, call) else { return };
    let available: Vec<(&str, Option<Type>)> = formals(caller).into_iter().filter_map(|parameter| Some((parameter_name(context, parameter)?, parameter_type(context, parameter)))).collect();
    let list = arguments(call);
    for (formal, actual) in formals(called).into_iter().zip(list.iter()) {
        let (Some(name), Some(formal_type)) = (parameter_name(context, formal), parameter_type(context, formal)) else { continue };
        let Some(Some(available_type)) = available.iter().rev().find(|(own, _)| *own == name).map(|(_, kind)| kind) else { continue };
        if references_identifier(context, name, call) {
            continue;
        }
        if context.resolver.assignable(available_type, &formal_type, false) {
            let fix = Fix::replace(actual.start_byte(), actual.end_byte(), name);
            let at = call.child_by_field_name("arguments").map_or(call.start_byte(), |list| list.start_byte());
            context.report_fixed("ChainingConstructorIgnoresParameter", call, at, CHAINING_MESSAGE, &[fix]);
        }
    }
}

/// How a name used in a method is declared: the declaration, and whether the compiler counts it as final.
enum Variable<'t> {
    Local { declaration: Node<'t>, region: Node<'t>, is_final: bool, initialized: bool },
    Field { class: String, name: String, is_final: bool },
}

fn declaration_of<'t>(context: &Context, usage: Node<'t>, name: &str) -> Option<Variable<'t>> {
    let mut inner = usage;
    let mut current = parent(usage);
    while let Some(node) = current {
        match node.kind() {
            "block" | "constructor_body" | "switch_block_statement_group" => {
                for statement in children(node).into_iter().filter(|statement| statement.kind() == "local_variable_declaration" && statement.start_byte() < usage.start_byte()) {
                    for declarator in crate::java::helpers::declarators(statement) {
                        if declarator.child_by_field_name("name").is_some_and(|part| context.text(part) == name) {
                            let initialized = declarator.child_by_field_name("value").is_some();
                            return Some(Variable::Local { declaration: declarator, region: node, is_final: has_modifier(statement, "final"), initialized });
                        }
                    }
                }
            }
            "for_statement" => {
                for statement in children(node).into_iter().filter(|part| part.kind() == "local_variable_declaration") {
                    for declarator in crate::java::helpers::declarators(statement) {
                        if declarator.child_by_field_name("name").is_some_and(|part| context.text(part) == name) {
                            return Some(Variable::Local { declaration: declarator, region: node, is_final: has_modifier(statement, "final"), initialized: true });
                        }
                    }
                }
            }
            "enhanced_for_statement" if node.child_by_field_name("name").is_some_and(|part| context.text(part) == name) && node.child_by_field_name("value") != Some(inner) => {
                return Some(Variable::Local { declaration: node, region: node, is_final: has_modifier(node, "final"), initialized: true });
            }
            "catch_clause" => {
                let parameter = children(node).into_iter().find(|part| part.kind() == "catch_formal_parameter")?;
                if parameter.child_by_field_name("name").is_some_and(|part| context.text(part) == name) {
                    return Some(Variable::Local { declaration: parameter, region: node, is_final: false, initialized: true });
                }
            }
            "try_with_resources_statement" => {
                for resource in node.child_by_field_name("resources").map(children).unwrap_or_default().into_iter().filter(|part| part.kind() == "resource") {
                    if resource.child_by_field_name("name").is_some_and(|part| context.text(part) == name) && resource.start_byte() < usage.start_byte() {
                        return Some(Variable::Local { declaration: resource, region: node, is_final: true, initialized: true });
                    }
                }
            }
            "method_declaration" | "constructor_declaration" | "lambda_expression" => {
                let list = node.child_by_field_name("parameters");
                let parameters: Vec<Node> = match list {
                    Some(list) if list.kind() == "identifier" => vec![list],
                    Some(list) => children(list),
                    None => Vec::new(),
                };
                for parameter in parameters {
                    let named = match parameter.kind() {
                        "identifier" => context.text(parameter) == name,
                        "formal_parameter" | "spread_parameter" => parameter_name(context, parameter) == Some(name),
                        _ => false,
                    };
                    if named {
                        return Some(Variable::Local { declaration: parameter, region: node, is_final: has_modifier(parameter, "final"), initialized: true });
                    }
                }
            }
            _ => {}
        }
        inner = node;
        current = parent(node);
    }
    match context.resolver.binding(usage, name)? {
        Binding::Field(_, class, field) => Some(Variable::Field { class: class.name.clone(), name: field.name.clone(), is_final: field.flags & flag::FINAL != 0 }),
        Binding::Local(_) => None,
    }
}

/// Whether the compiler counts the variable as final: declared so, or a local never assigned again.
fn considered_final(context: &Context, name: &str, variable: &Variable) -> bool {
    match variable {
        Variable::Field { is_final, .. } => *is_final,
        Variable::Local { declaration, region, is_final, initialized } => {
            if *is_final {
                return true;
            }
            let mut assignments = 0;
            walk(*region, |part| {
                let target = match part.kind() {
                    "assignment_expression" => part.child_by_field_name("left"),
                    "update_expression" => children(part).into_iter().find(|child| child.kind() == "identifier"),
                    _ => None,
                };
                let Some(target) = target.filter(|target| target.kind() == "identifier" && context.text(*target) == name) else { return };
                if matches!(declaration_of(context, target, name), Some(Variable::Local { declaration: found, .. }) if found.id() == declaration.id()) {
                    assignments += 1;
                }
            });
            assignments == 0 || (!initialized && assignments == 1)
        }
    }
}

fn key(variable: &Variable) -> String {
    match variable {
        Variable::Local { declaration, .. } => format!("local {}", declaration.id()),
        Variable::Field { class, name, .. } => format!("field {class}.{name}"),
    }
}

const SKIPPED: [&str; 10] =
    ["if_statement", "switch_expression", "switch_statement", "lambda_expression", "class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration", "class_body"];

struct Checks<'t> {
    counts: Vec<(String, String, usize, Node<'t>)>,
}

fn scan<'t>(context: &Context, node: Node<'t>, found: &mut Checks<'t>, root: bool) {
    if !root && SKIPPED.contains(&node.kind()) {
        return;
    }
    if matches!(node.kind(), "try_statement" | "try_with_resources_statement") {
        if let Some(body) = node.child_by_field_name("body") {
            scan(context, body, found, false);
        }
        return;
    }
    if node.kind() == "method_invocation" {
        record(context, node, found);
    }
    for child in children(node) {
        scan(context, child, found, false);
    }
}

fn record<'t>(context: &Context, call: Node<'t>, found: &mut Checks<'t>) {
    if call.child_by_field_name("name").is_none_or(|name| context.text(name) != "checkNotNull") {
        return;
    }
    let list = arguments(call);
    let Some(first) = list.first().filter(|first| first.kind() == "identifier") else { return };
    if parent(call).is_none_or(|statement| !matches!(statement.kind(), "expression_statement" | "return_statement" | "throw_statement" | "yield_statement" | "assert_statement" | "variable_declarator")) || !static_on_class(context, call, "com.google.common.base.Preconditions", &["checkNotNull"]) {
        return;
    }
    let name = context.text(*first);
    let Some(variable) = declaration_of(context, *first, name) else { return };
    if !considered_final(context, name, &variable) {
        return;
    }
    let identity = key(&variable);
    match found.counts.iter_mut().find(|entry| entry.0 == identity) {
        Some(entry) => {
            entry.2 += 1;
            entry.3 = call;
        }
        None => found.counts.push((identity, name.to_string(), 1, call)),
    }
}

pub fn check_not_null_multiple_times(context: &Context, method: Node) {
    if !matches!(method.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration") {
        return;
    }
    let mut found = Checks { counts: Vec::new() };
    scan(context, method, &mut found, true);
    for (_, name, count, last) in found.counts {
        if count > 1 {
            let message = format!("checkNotNull({name}) was called more than once. Did you mean to check something else?");
            context.report_fixed("CheckNotNullMultipleTimes", last, super::positions::preferred(context, last), &message, &[]);
        }
    }
}
