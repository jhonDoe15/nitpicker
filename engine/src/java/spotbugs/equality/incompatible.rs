//! EQ_CHECK_FOR_OPERAND_NOT_COMPATIBLE_WITH_THIS (EqualsOperandShouldHaveClassCompatibleWithThis): `equals(Object)`
//! tests or casts its argument to a type that is neither a supertype nor a subtype of its class: `instanceof`, casts,
//! type patterns of `instanceof` and `switch`, and `X.class.isInstance(o)` or `X.class.cast(o)`. A local counts by
//! the value last stored into it above the test: the argument (also through casts to `Object` and conditionals), or
//! a class literal. One finding per type, at its first
//! test; priority 1, or 2 for an interface outside `java.util` when the class is not final.
use super::super::classes::Shape;
use super::super::{Context, names, place};
use super::equals::{is, methods, takes};
use crate::engine::source::{children, named_children};
use crate::java::helpers::has_modifier;
use crate::java::types::expr::unwrap;
use crate::java::types::model::{OBJECT, Type};
use std::collections::HashSet;
use tree_sitter::Node;

pub const PATTERNS: &[&str] = &["EQ_CHECK_FOR_OPERAND_NOT_COMPATIBLE_WITH_THIS"];

struct Body<'c, 'a, 't> {
    context: &'c Context<'a>,
    nodes: Vec<Node<'t>>,
}

impl<'t> Body<'_, '_, 't> {
    /// The value last stored into a local before `at`, as the code reads top to bottom: a declaration with a value
    /// or a plain assignment. `Err` when another kind of write comes last.
    fn reaching(&self, name: &str, at: Node) -> Result<Option<Node<'t>>, ()> {
        let named = |node: Option<Node>| node.map(unwrap).is_some_and(|node| node.kind() == "identifier" && self.context.text(node) == name);
        let mut found = Ok(None);
        for node in self.nodes.iter().filter(|node| node.end_byte() <= at.start_byte()) {
            match node.kind() {
                "variable_declarator" if named(node.child_by_field_name("name")) => {
                    if let Some(value) = node.child_by_field_name("value") {
                        found = Ok(Some(value));
                    }
                }
                "assignment_expression" if named(node.child_by_field_name("left")) => {
                    let plain = node.child_by_field_name("operator").is_some_and(|operator| self.context.text(operator) == "=");
                    let certain = plain && !branched(*node, at);
                    found = if certain { node.child_by_field_name("right").map(Some).ok_or(()) } else { Err(()) };
                }
                _ => {}
            }
        }
        found
    }

    /// Whether an expression holds the `equals` argument: the parameter itself, a local last given it, a cast of it
    /// to `Object` or a conditional whose chosen arms all hold it.
    fn holds(&self, node: Node<'t>, parameter: &str, depth: usize) -> bool {
        let node = widened(self.context, node);
        if depth > 16 {
            return false;
        }
        match node.kind() {
            "identifier" => match self.reaching(self.context.text(node), node) {
                Ok(Some(value)) => self.holds(value, parameter, depth + 1),
                Ok(None) => self.context.text(node) == parameter,
                Err(()) => false,
            },
            "ternary_expression" => {
                let arm = |name: &str| node.child_by_field_name(name).is_some_and(|arm| self.holds(arm, parameter, depth + 1));
                match node.child_by_field_name("condition").and_then(|condition| super::super::folds::fixed(self.context, Some(condition))) {
                    Some(true) => arm("consequence"),
                    Some(false) => arm("alternative"),
                    None => arm("consequence") && arm("alternative"),
                }
            }
            _ => false,
        }
    }

    fn class_literal(&self, object: Node<'t>) -> Option<Node<'t>> {
        let object = unwrap(object);
        match object.kind() {
            "class_literal" => object.named_child(0),
            "identifier" => self.reaching(self.context.text(object), object).ok().flatten().map(unwrap).filter(|value| value.kind() == "class_literal").and_then(|value| value.named_child(0)),
            _ => None,
        }
    }
}

/// `x.equals(o)` on a value whose type is a class: SpotBugs takes the call as a test for that class.
fn delegated(context: &Context, node: Node, alias: &dyn Fn(Option<Node>) -> bool) -> Option<Type> {
    let called = node.child_by_field_name("name").filter(|_| node.kind() == "method_invocation").map(|name| context.text(name));
    let arguments = named_children(node.child_by_field_name("arguments")?).into_iter().filter(|part| !part.kind().ends_with("comment")).collect::<Vec<_>>();
    let [argument] = arguments.as_slice() else { return None };
    let kind = context.resolver.type_of(node.child_by_field_name("object")?)?.erased();
    let Type::Class(name, _) = &kind else { return None };
    let class = context.resolver.index.get(name).is_some_and(|info| !info.is_interface);
    (called == Some("equals") && class && alias(Some(*argument))).then_some(kind)
}

/// Whether a write sits in a branch or loop that does not also hold `at`, so that other values can reach `at` too.
fn branched(write: Node, at: Node) -> bool {
    let mut node = write;
    while let Some(up) = crate::engine::source::parent(node) {
        if up.start_byte() <= at.start_byte() && at.end_byte() <= up.end_byte() {
            return false;
        }
        let kinds = ["if_statement", "while_statement", "for_statement", "enhanced_for_statement", "do_statement", "switch_block_statement_group", "switch_rule", "catch_clause", "ternary_expression", "binary_expression", "lambda_expression"];
        if kinds.contains(&up.kind()) {
            return true;
        }
        node = up;
    }
    false
}

/// The type written in a pattern: the last but one part of a type pattern, the first of a record pattern.
fn pattern_type(pattern: Node) -> Option<Node> {
    let parts: Vec<Node> = named_children(pattern).into_iter().filter(|part| !part.kind().ends_with("comment") && part.kind() != "modifiers").collect();
    match pattern.kind() {
        "type_pattern" => parts.len().checked_sub(2).and_then(|at| parts.get(at).copied()).or_else(|| parts.first().copied()),
        "record_pattern" => parts.first().copied(),
        _ => Some(pattern),
    }
}

pub fn check(context: &Context, shape: &Shape) {
    let interface = matches!(shape.class.kind(), "interface_declaration" | "annotation_type_declaration");
    if interface || !context.wants(PATTERNS) {
        return;
    }
    for (method, parameters) in methods(context, shape, "equals") {
        let boolean = method.child_by_field_name("type").is_some_and(|kind| context.text(kind) == "boolean");
        let Some(code) = method.child_by_field_name("body").filter(|_| boolean && takes(&parameters, OBJECT)) else { continue };
        let Some(parameter) = method.child_by_field_name("parameters").and_then(|list| named_children(list).into_iter().find(|part| part.kind() == "formal_parameter")) else { continue };
        let Some(name) = parameter.child_by_field_name("name").map(|name| context.text(name).to_string()) else { continue };
        let mut nodes = Vec::new();
        super::super::comparators::own_nodes(code, &mut nodes);
        let body = Body { context, nodes };
        let label = names::method(context, &shape.own, method, None);
        let alias = |node: Option<Node<'_>>| node.is_some_and(|node| body.holds(node, &name, 0));
        let mut reported = HashSet::new();
        for node in &body.nodes {
            let tested = match node.kind() {
                "instanceof_expression" if alias(node.child_by_field_name("left")) => {
                    let pattern = children(*node).into_iter().find(|part| matches!(part.kind(), "record_pattern" | "pattern"));
                    let pattern = pattern.map(|pattern| if pattern.kind() == "pattern" { named_children(pattern).into_iter().next().unwrap_or(pattern) } else { pattern });
                    node.child_by_field_name("right").or(pattern).and_then(pattern_type)
                }
                "cast_expression" if alias(node.child_by_field_name("value")) => node.child_by_field_name("type"),
                "method_invocation" => {
                    let called = node.child_by_field_name("name").map(|name| context.text(name));
                    let argument = node.child_by_field_name("arguments").and_then(|list| named_children(list).into_iter().next());
                    let object = node.child_by_field_name("object").and_then(|object| body.class_literal(object));
                    object.filter(|_| matches!(called, Some("isInstance" | "cast")) && alias(argument))
                }
                "switch_label" => {
                    let switch = crate::engine::source::ancestor(*node, &["switch_statement", "switch_expression"]);
                    let on = switch.and_then(|switch| switch.child_by_field_name("condition")).and_then(|condition| named_children(condition).into_iter().next().or(Some(condition)));
                    let pattern = children(*node).into_iter().find(|part| matches!(part.kind(), "type_pattern" | "record_pattern" | "pattern"));
                    let pattern = pattern.map(|pattern| if pattern.kind() == "pattern" { named_children(pattern).into_iter().next().unwrap_or(pattern) } else { pattern });
                    pattern.filter(|_| alias(on)).and_then(pattern_type)
                }
                _ => None,
            };
            let Some(kind) = tested.and_then(|written| context.resolver.type_node(written)).or_else(|| delegated(context, *node, &alias)) else { continue };
            let Some((shown, priority)) = incompatible(context, shape, &kind).filter(|(_, priority)| *priority <= 2) else { continue };
            if !reported.insert(shown.clone()) {
                continue;
            }
            let line = super::super::compare::lines::line(context, *node);
            let message = format!("{label} checks for operand being a {shown}");
            context.report_listed(PATTERNS[0], *node, line, message, place::function(&label), priority, vec![label.clone(), shown]);
        }
    }
}

/// The type as SpotBugs shows it and the priority, when it is incompatible with the class.
fn incompatible(context: &Context, shape: &Shape, kind: &Type) -> Option<(String, u8)> {
    let index = context.resolver.index;
    let package = names::package_of(&names::binary(context, &shape.own)).to_string();
    let shown = |binary: String| -> String {
        let local = binary.strip_prefix(&package).and_then(|rest| rest.strip_prefix('.')).filter(|_| !package.is_empty());
        let lang = binary.strip_prefix("java.lang.");
        lang.or(local).map(str::to_string).unwrap_or(binary)
    };
    match kind {
        Type::Array(_) => Some((shown_array(context, kind, &shown), 1 + u8::from(plain_local(context, shape)))),
        Type::Class(name, _) => {
            if is(kind, OBJECT) || index.is_subtype(&shape.own, name) || index.is_subtype(name, &shape.own) {
                return None;
            }
            let info = index.get(name)?;
            let open = !(has_modifier(shape.class, "final") || matches!(shape.class.kind(), "record_declaration" | "enum_declaration"));
            let binary = names::binary(context, name);
            let util = binary.starts_with("java.util.");
            if shares_collection(context, &shape.own, name) {
                return None;
            }
            let priority = if info.is_interface && open && !util { 2 } else { 1 };
            Some((shown(binary), priority + u8::from(plain_local(context, shape))))
        }
        _ => None,
    }
}

/// Two classes that are both a `java.util` `List`, `Set` or `Map`, which SpotBugs takes as comparable.
fn shares_collection(context: &Context, own: &str, other: &str) -> bool {
    let index = context.resolver.index;
    ["java.util.List", "java.util.Set", "java.util.Map"].iter().any(|shared| index.is_subtype(own, shared) && index.is_subtype(other, shared))
}

/// An anonymous or local class whose superclass is `Object`: SpotBugs lowers its findings by one.
fn plain_local(context: &Context, shape: &Shape) -> bool {
    let local = match shape.class.kind() {
        "object_creation_expression" => true,
        "class_declaration" => !matches!(shape.class.parent().map(|parent| parent.kind()), Some("class_body" | "program" | "interface_body" | "enum_body_declarations" | "annotation_type_body") | None),
        _ => false,
    };
    let above = context.resolver.index.get(&shape.own).and_then(|info| info.superclass.clone());
    local && above.is_none_or(|above| above == OBJECT)
}

/// The value under casts to `Object`, which javac writes no instruction for.
fn widened<'t>(context: &Context, node: Node<'t>) -> Node<'t> {
    let mut node = unwrap(node);
    while node.kind() == "cast_expression" && node.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind)).is_some_and(|kind| is(&kind, OBJECT)) {
        let Some(value) = node.child_by_field_name("value") else { break };
        node = unwrap(value);
    }
    node
}

fn shown_array(context: &Context, kind: &Type, shown: &dyn Fn(String) -> String) -> String {
    match kind {
        Type::Array(element) => format!("{}[]", shown_array(context, element, shown)),
        Type::Class(name, _) => shown(names::binary(context, name)),
        other => other.erased().name(),
    }
}
