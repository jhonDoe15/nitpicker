//! BC_EQUALS_METHOD_SHOULD_WORK_FOR_ALL_OBJECTS: `equals(Object)` casts its argument before anything has tested the
//! argument's class, outside a `try` that handles the failure.
use super::super::{Context, names, place};
use super::equals::{is, methods, takes};
use super::super::classes::{Shape, lines};
use crate::engine::source::{ancestor, children, named_children, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::expr::unwrap;
use crate::java::types::model::OBJECT;
use std::collections::HashSet;
use tree_sitter::Node;

pub const PATTERNS: &[&str] = &["BC_EQUALS_METHOD_SHOULD_WORK_FOR_ALL_OBJECTS"];

/// What the walk through an `equals` body has seen so far.
struct Walk<'c, 'a, 't> {
    context: &'c Context<'a>,
    aliases: HashSet<String>,
    parameter: String,
    tested: bool,
    cast: Option<Node<'t>>,
}

impl<'t> Walk<'_, '_, 't> {
    fn alias(&self, expression: Node) -> bool {
        let value = unwrap(expression);
        value.kind() == "identifier" && self.aliases.contains(self.context.text(value))
    }

    /// A call that tests the argument's class: `o.getClass()`, `c.isInstance(o)` or `super.equals(o)`.
    fn tests(&self, call: Node) -> bool {
        let name = call.child_by_field_name("name").map(|name| self.context.text(name));
        let arguments = call.child_by_field_name("arguments").map(named_children).unwrap_or_default();
        let object = call.child_by_field_name("object");
        match name {
            Some("getClass") => object.is_some_and(|object| self.alias(object)),
            Some("isInstance") => arguments.first().is_some_and(|argument| self.alias(*argument)),
            Some("equals") => {
                let on_super = object.is_some_and(|object| object.kind() == "super");
                on_super && arguments.iter().any(|argument| self.alias(*argument))
            }
            _ => false,
        }
    }

    fn casts(&self, cast: Node) -> bool {
        let target = cast.child_by_field_name("type").and_then(|written| self.context.resolver.type_node(written));
        let argument = cast.child_by_field_name("value").is_some_and(|value| self.alias(value));
        argument && target.is_some_and(|kind| !is(&kind, OBJECT))
    }

    /// The first type pattern of a `switch` on the argument, which javac writes as a cast.
    fn pattern(&self, switch: Node<'t>) -> Option<Node<'t>> {
        let on = switch.child_by_field_name("condition").is_some_and(|condition| self.alias(condition));
        let mut found = None;
        walk(switch, |part| {
            if found.is_none() && matches!(part.kind(), "type_pattern" | "record_pattern") {
                found = Some(part);
            }
        });
        found.filter(|_| on)
    }

    fn visit(&mut self, node: Node<'t>, protected: bool) {
        if self.cast.is_some() || matches!(node.kind(), "lambda_expression" | "class_body") {
            return;
        }
        let hit = match node.kind() {
            "instanceof_expression" => {
                self.tested |= node.child_by_field_name("left").is_some_and(|left| self.alias(left));
                None
            }
            "method_invocation" => {
                self.tested |= self.tests(node);
                None
            }
            "cast_expression" => Some(node).filter(|cast| self.casts(*cast)),
            "switch_expression" | "switch_statement" => self.pattern(node),
            _ => None,
        };
        if hit.is_some() && !self.tested && !protected {
            self.cast = hit;
            return;
        }
        let guarded = |part: Node| match node.kind() {
            "try_statement" | "try_with_resources_statement" => {
                let handler = |other: &Node| matches!(other.kind(), "catch_clause" | "finally_clause");
                let handles = children(node).iter().any(handler);
                handles && !matches!(part.kind(), "catch_clause" | "finally_clause")
            }
            "synchronized_statement" => part.kind() == "block",
            _ => false,
        };
        for part in children(node) {
            self.visit(part, protected || guarded(part));
        }
        let copy = match node.kind() {
            "variable_declarator" => node.child_by_field_name("name").zip(node.child_by_field_name("value")),
            "assignment_expression" => node.child_by_field_name("left").zip(node.child_by_field_name("right")),
            _ => None,
        };
        if let Some((name, value)) = copy.filter(|(name, _)| name.kind() == "identifier") {
            let name = self.context.text(name).to_string();
            if self.alias(value) {
                self.aliases.insert(name);
            } else if name != self.parameter {
                self.aliases.remove(&name);
            }
        }
    }
}

/// The line javac gives the code of the statement that holds the cast.
fn line_of(context: &Context, cast: Node) -> usize {
    let holders = ["local_variable_declaration", "expression_statement", "return_statement", "if_statement"];
    let Some(statement) = ancestor(cast, &holders) else { return context.line(cast) };
    if statement.kind() == "local_variable_declaration" {
        let declarator = ancestor(cast, &["variable_declarator"]).and_then(|part| part.child_by_field_name("name"));
        return declarator.map_or_else(|| context.line(statement), |name| context.line(name));
    }
    lines::statement_start(context, statement).unwrap_or_else(|| context.line(statement))
}

pub fn check(context: &Context, shape: &Shape) {
    if !context.wants(PATTERNS) || shape.class.kind().ends_with("interface_declaration") {
        return;
    }
    let binary = names::binary(context, &shape.own);
    for (method, parameters) in methods(context, shape, "equals") {
        let list = method.child_by_field_name("parameters");
        let parameter = list.and_then(|list| named_children(list).into_iter().next());
        let argument = parameter.and_then(|parameter| parameter.child_by_field_name("name"));
        let public = has_modifier(method, "public") && takes(&parameters, OBJECT);
        let (Some(argument), Some(body)) = (argument.filter(|_| public), method.child_by_field_name("body")) else {
            continue;
        };
        let parameter = context.text(argument).to_string();
        let aliases = HashSet::from([parameter.clone()]);
        let mut found = Walk { context, aliases, parameter, tested: false, cast: None };
        found.visit(body, false);
        let Some(cast) = found.cast else { continue };
        let short = names::short(&binary).to_string();
        let message = format!("Equals method for {binary} assumes the argument is of type {short}");
        let place = place::function(&format!("{binary}.equals(Object)"));
        let arguments = vec![binary.clone(), short];
        context.report_listed(PATTERNS[0], method, line_of(context, cast), message, place, 2, arguments);
    }
}
