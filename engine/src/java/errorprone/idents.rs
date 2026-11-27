//! Error Prone's `FindIdentifiers.findAllIdents`, by name: the variables visible at a node, as `VariableNamer` sees them.
use super::Context;
use super::shape::is_class;
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::{declarators, has_modifier};
use std::collections::HashSet;
use super::idents_found::{Kind, Var, add_fields, add_locals, names_of, static_imports};
use tree_sitter::Node;

/// Kinds javac has no tree for: the walk passes through them.
const TRANSPARENT: [&str; 11] = [
    "argument_list", "formal_parameters", "resource_specification", "catch_formal_parameter", "finally_clause", "dimensions_expr", "class_body", "enum_body",
    "interface_body", "annotation_type_body", "enum_body_declarations",
];

fn up(node: Node) -> Option<Node> {
    let mut current = parent(node)?;
    while TRANSPARENT.contains(&current.kind()) {
        current = parent(current)?;
    }
    Some(current)
}

fn is_expression(node: Node) -> bool {
    let kind = node.kind();
    if kind == "switch_expression" {
        return !super::reach::is_statement_switch(node);
    }
    kind.ends_with("_expression")
        || matches!(kind, "method_invocation" | "field_access" | "array_access" | "method_reference" | "identifier" | "this" | "array_initializer")
}

pub(super) fn class_body(node: Node) -> Option<Node> {
    children(node).into_iter().find(|part| matches!(part.kind(), "class_body" | "enum_body" | "interface_body" | "annotation_type_body"))
}

pub(super) fn is_class_tree(node: Node) -> bool {
    is_class(node) || (node.kind() == "object_creation_expression" && class_body(node).is_some())
}

/// The binding variables a condition introduces when it is true (or false, when negated).
fn bindings(context: &Context, condition: Node, negated: bool, out: &mut Vec<Var>) {
    match condition.kind() {
        "instanceof_expression" if !negated => {
            if let Some(name) = condition.child_by_field_name("name") {
                out.push(Var::local(context, name, condition));
            }
            if let Some(pattern) = condition.child_by_field_name("pattern") {
                record_bindings(context, pattern, out);
            }
        }
        "parenthesized_expression" => {
            if let Some(inner) = named_children(condition).into_iter().find(|part| !part.kind().ends_with("comment")) {
                bindings(context, inner, negated, out);
            }
        }
        "unary_expression" if condition.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "!") => {
            if let Some(operand) = condition.child_by_field_name("operand") {
                bindings(context, operand, !negated, out);
            }
        }
        "binary_expression" => {
            let operator = condition.child_by_field_name("operator").map_or("", |operator| context.text(operator));
            if (operator == "&&" && !negated) || (operator == "||" && negated) {
                for side in ["left", "right"] {
                    if let Some(operand) = condition.child_by_field_name(side) {
                        bindings(context, operand, negated, out);
                    }
                }
            }
        }
        _ => {}
    }
}

fn record_bindings(context: &Context, pattern: Node, out: &mut Vec<Var>) {
    for part in named_children(pattern) {
        match part.kind() {
            "record_pattern_body" | "record_pattern" => record_bindings(context, part, out),
            "record_pattern_component" => {
                if let Some(nested) = named_children(part).into_iter().find(|inner| inner.kind() == "record_pattern") {
                    record_bindings(context, nested, out);
                } else if let Some(name) = named_children(part).into_iter().filter(|inner| inner.kind() == "identifier").last() {
                    out.push(Var::local(context, name, part));
                }
            }
            _ => {}
        }
    }
}

/// JLS 8.3.1 static context, as Error Prone's `inStaticContext` walks it.
fn in_static_context(node: Node) -> bool {
    let mut prev = node;
    let mut current = up(node);
    while let Some(at) = current {
        match at.kind() {
            "method_declaration" => return has_modifier(at, "static"),
            "constructor_declaration" | "compact_constructor_declaration" => return false,
            "static_initializer" => return true,
            "field_declaration" | "constant_declaration" => {
                let is_static = at.kind() == "constant_declaration" || has_modifier(at, "static") || parent(at).is_some_and(|body| body.kind() == "interface_body");
                return is_static && declarators(at).into_iter().any(|declarator| declarator.child_by_field_name("value").is_some_and(|value| value.id() == prev.id()));
            }
            "explicit_constructor_invocation" => return true,
            _ => {}
        }
        prev = at;
        current = up(at);
    }
    false
}

fn static_symbol(context: &Context, node: Node) -> bool {
    match node.kind() {
        "method_invocation" => context.resolver.resolve_call(node).is_some_and(|resolved| resolved.method.is_static),
        "method_declaration" => has_modifier(node, "static"),
        "field_declaration" | "constant_declaration" => node.kind() == "constant_declaration" || has_modifier(node, "static") || parent(node).is_some_and(|body| body.kind() == "interface_body"),
        _ if is_class(node) => {
            has_modifier(node, "static")
                || (parent(node).is_some_and(|up| up.kind() != "program") && (node.kind() != "class_declaration" || parent(node).is_some_and(|up| matches!(up.kind(), "interface_body" | "annotation_type_body"))))
        }
        _ => false,
    }
}

fn visible(context: &Context, leaf: Node, var: &Var, classes: &[String]) -> bool {
    match &var.kind {
        Kind::Always => true,
        Kind::Local(owner) => {
            let Some(owner) = owner else { return true };
            let mut current = up(leaf);
            while let Some(at) = current {
                if at.id() == *owner {
                    return true;
                }
                let crosses = at.kind() == "lambda_expression"
                    || (at.kind() == "object_creation_expression" && class_body(at).is_some())
                    || (at.kind() == "class_declaration" && parent(at).is_some_and(|up| matches!(up.kind(), "block" | "constructor_body")));
                if crosses {
                    let reaches = std::iter::successors(up(at), |each| up(*each)).any(|each| each.id() == *owner);
                    return !reaches || var.final_local;
                }
                current = up(at);
            }
            true
        }
        Kind::Field { owner, is_static, is_private, public_or_protected, package } => {
            if !is_static {
                if in_static_context(leaf) {
                    return false;
                }
                let mut current = up(leaf);
                while let Some(at) = current {
                    if is_class_tree(at) && context.resolver.scope.names.get(&at.id()) == Some(owner) {
                        break;
                    }
                    if static_symbol(context, at) {
                        let reaches = std::iter::successors(up(at), |each| up(*each)).any(|each| is_class_tree(each) && context.resolver.scope.names.get(&each.id()) == Some(owner));
                        if reaches {
                            return false;
                        }
                        break;
                    }
                    current = up(at);
                }
            }
            if classes.contains(owner) {
                return true;
            }
            if *package == context.resolver.scope.package {
                return !is_private;
            }
            *public_or_protected
        }
    }
}

/// The names of the variables visible at the node.
pub fn all_idents(context: &Context, leaf: Node) -> HashSet<String> {
    let mut found: Vec<Var> = Vec::new();
    let mut prev = leaf;
    let mut current = up(leaf);
    while let Some(at) = current {
        if at.kind() == "binary_expression" && at.child_by_field_name("right").is_some_and(|right| right.id() == prev.id()) {
            let operator = at.child_by_field_name("operator").map_or("", |operator| context.text(operator));
            if let (true, Some(left)) = (matches!(operator, "&&" | "||"), at.child_by_field_name("left")) {
                bindings(context, left, operator == "||", &mut found);
            }
        } else if !is_expression(at) {
            break;
        }
        prev = at;
        current = up(at);
    }
    let mut classes: Vec<String> = Vec::new();
    let mut prev = leaf;
    let mut current = up(leaf);
    while let Some(at) = current {
        match at.kind() {
            "block" | "constructor_body" => {
                for statement in named_children(at) {
                    if statement.id() == prev.id() {
                        break;
                    }
                    if statement.kind() == "local_variable_declaration" {
                        add_locals(context, statement, &mut found);
                    }
                    if statement.kind() == "if_statement" && statement.child_by_field_name("consequence").is_some_and(|then| !super::reach::can_complete_normally(context, then)) {
                        if let Some(condition) = statement.child_by_field_name("condition") {
                            bindings(context, condition, true, &mut found);
                        }
                    }
                }
            }
            "lambda_expression" => {
                if let Some(parameters) = at.child_by_field_name("parameters") {
                    if parameters.kind() == "identifier" {
                        found.push(Var::local(context, parameters, at));
                    } else {
                        for parameter in named_children(parameters) {
                            match parameter.kind() {
                                "identifier" => found.push(Var::local(context, parameter, at)),
                                _ => add_locals(context, parameter, &mut found),
                            }
                        }
                    }
                }
            }
            "method_declaration" | "constructor_declaration" => {
                if let Some(parameters) = at.child_by_field_name("parameters") {
                    for parameter in named_children(parameters) {
                        add_locals(context, parameter, &mut found);
                    }
                }
            }
            "catch_clause" => {
                if let Some(parameter) = children(at).into_iter().find(|part| part.kind() == "catch_formal_parameter") {
                    for name in names_of(parameter) {
                        found.push(Var { name: context.text(name).to_string(), kind: Kind::Always, final_local: true });
                    }
                }
            }
            "for_statement" => {
                for part in named_children(at).into_iter().filter(|part| part.kind() == "local_variable_declaration") {
                    add_locals(context, part, &mut found);
                }
            }
            "enhanced_for_statement" => add_locals(context, at, &mut found),
            "try_with_resources_statement" => {
                let resources: Vec<Node> = at.child_by_field_name("resources").map(named_children).unwrap_or_default().into_iter().filter(|part| part.kind() == "resource").collect();
                let within = resources.iter().any(|resource| resource.id() == prev.id());
                let in_block = at.child_by_field_name("body").is_some_and(|body| body.id() == prev.id());
                for resource in resources.iter().take_while(|resource| !within || resource.id() != prev.id()) {
                    if within || in_block {
                        for name in names_of(*resource) {
                            found.push(Var { name: context.text(name).to_string(), kind: Kind::Always, final_local: true });
                        }
                    }
                }
            }
            "if_statement" => {
                if let Some(condition) = at.child_by_field_name("condition") {
                    if at.child_by_field_name("consequence").is_some_and(|then| then.id() == prev.id()) {
                        bindings(context, condition, false, &mut found);
                    }
                    if at.child_by_field_name("alternative").is_some_and(|otherwise| otherwise.id() == prev.id()) {
                        bindings(context, condition, true, &mut found);
                    }
                }
            }
            "ternary_expression" => {
                if let Some(condition) = at.child_by_field_name("condition") {
                    if at.child_by_field_name("consequence").is_some_and(|then| then.id() == prev.id()) {
                        bindings(context, condition, false, &mut found);
                    }
                    if at.child_by_field_name("alternative").is_some_and(|otherwise| otherwise.id() == prev.id()) {
                        bindings(context, condition, true, &mut found);
                    }
                }
            }
            "program" => static_imports(context, at, &mut found),
            _ if is_class(at) || (is_class_tree(at) && parent(prev).is_some_and(|body| body.kind() == "class_body")) => {
                if let Some(name) = context.resolver.scope.names.get(&at.id()) {
                    classes.push(name.clone());
                }
                add_fields(context, at, prev, &mut found);
            }
            _ => {}
        }
        prev = at;
        current = up(at);
    }
    found.into_iter().filter(|var| visible(context, leaf, var, &classes)).map(|var| var.name).collect()
}
