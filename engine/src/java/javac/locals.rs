//! Which declaration a simple name inside a method body stands for: a local variable, a parameter, a pattern
//! variable, or a field.
use crate::engine::source::{SourceFile, children, parent};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::expr::Binding;
use crate::java::types::model::Type;
use crate::java::types::scope::{Resolver, class_at};
use std::collections::HashMap;
use tree_sitter::Node;

pub enum Found<'t> {
    /// The declarator, parameter, pattern or statement that introduces the variable.
    Local(Node<'t>),
    Field,
}

/// Bodies a pattern variable cannot leave.
const CLOSED: &[&str] = &["lambda_expression", "class_body", "method_declaration", "constructor_declaration"];

/// The pattern variables and the local variable declarators of a file, by name, so that a lookup does not
/// walk the statements of a block again for every name in it.
pub struct Scopes<'t> {
    /// `o instanceof String s`, `case Point(int x, var y)`.
    patterns: HashMap<String, Vec<Node<'t>>>,
    declared: HashMap<String, Vec<Node<'t>>>,
}

impl<'t> Scopes<'t> {
    pub fn of(file: &SourceFile, root: Node<'t>) -> Scopes<'t> {
        let mut scopes = Scopes { patterns: HashMap::new(), declared: HashMap::new() };
        crate::engine::source::walk(root, |node| {
            let name = match node.kind() {
                "instanceof_expression" => node.child_by_field_name("name"),
                "type_pattern" | "record_pattern_component" => children(node).into_iter().filter(|part| part.kind() == "identifier").last(),
                "local_variable_declaration" => {
                    for declarator in declarators(node) {
                        if let Some(name) = declarator.child_by_field_name("name") {
                            scopes.declared.entry(file.text_of(name).to_string()).or_default().push(declarator);
                        }
                    }
                    None
                }
                _ => None,
            };
            if let Some(name) = name {
                scopes.patterns.entry(file.text_of(name).to_string()).or_default().push(node);
            }
        });
        scopes
    }

    /// The declarator of `name` among the statements of `block` that come before `inner`.
    fn earlier(&self, block: Node<'t>, inner: Node, name: &str) -> Option<Node<'t>> {
        self.declared.get(name)?.iter().copied().find(|declarator| {
            declarator.start_byte() < inner.start_byte() && parent(*declarator).and_then(parent).is_some_and(|holder| holder.id() == block.id())
        })
    }
}

/// Whether an identifier reads or writes a variable, rather than naming a method, a member, a label or a declaration.
pub fn is_use(node: Node) -> bool {
    let Some(holder) = parent(node) else { return false };
    if holder.child_by_field_name("name") == Some(node) {
        return false;
    }
    match holder.kind() {
        "field_access" => holder.child_by_field_name("field") != Some(node),
        "method_reference" => holder.child(0) == Some(node),
        "lambda_expression" => holder.child_by_field_name("parameters") != Some(node),
        "resource" => true,
        "labeled_statement" | "break_statement" | "continue_statement" | "scoped_identifier" | "inferred_parameters" | "record_pattern"
        | "type_pattern" | "record_pattern_component" | "element_value_pair" | "annotation" | "marker_annotation" | "enum_constant" | "switch_label" => false,
        _ => true,
    }
}

fn parameter<'t>(file: &SourceFile, list: Node<'t>, name: &str) -> Option<Node<'t>> {
    if list.kind() == "identifier" {
        return (file.text_of(list) == name).then_some(list);
    }
    children(list).into_iter().find(|parameter| {
        let written = match parameter.kind() {
            "identifier" => Some(*parameter),
            "formal_parameter" => parameter.child_by_field_name("name"),
            "spread_parameter" => children(*parameter).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|part| part.child_by_field_name("name")),
            _ => None,
        };
        written.is_some_and(|written| file.text_of(written) == name)
    })
}

/// Whether a pattern variable is still in scope at `usage`: inside the statement or `case` that holds the
/// pattern, or after an `if` or `while` whose test is the negated pattern (`if (!(o instanceof T t)) return;`).
fn reaches(file: &SourceFile, pattern: Node, usage: Node) -> bool {
    let holds = |outer: Node| outer.start_byte() <= usage.start_byte() && usage.end_byte() <= outer.end_byte();
    let mut negated = false;
    let mut current = parent(pattern);
    while let Some(around) = current {
        let kind = around.kind();
        negated |= kind == "unary_expression" && file.text_of(around).starts_with('!');
        if kind.ends_with("_statement") || matches!(kind, "switch_rule" | "switch_block_statement_group" | "local_variable_declaration" | "field_declaration") {
            let after = negated && matches!(kind, "if_statement" | "while_statement") && parent(around).is_some_and(holds);
            return holds(around) || after;
        }
        if CLOSED.contains(&kind) {
            return holds(around);
        }
        current = parent(around);
    }
    true
}

/// The declaration `name` stands for at `usage`, looking outwards through blocks, lambdas and class bodies.
pub fn declaration<'t>(resolver: &Resolver, scopes: &Scopes<'t>, usage: Node<'t>, name: &str) -> Option<Found<'t>> {
    let file = resolver.file;
    let named = |holder: Node| holder.child_by_field_name("name").is_some_and(|written| file.text_of(written) == name);
    let mut inner = usage;
    let mut scope = parent(usage);
    while let Some(node) = scope {
        let found = match node.kind() {
            "block" | "constructor_body" | "switch_block_statement_group" => scopes.earlier(node, inner, name),
            "switch_block" => {
                let mut cursor = node.walk();
                let groups: Vec<Node> = node.children(&mut cursor).take_while(|group| group.start_byte() < inner.start_byte()).collect();
                groups.into_iter().filter(|group| group.kind() == "switch_block_statement_group").find_map(|group| scopes.earlier(group, node, name))
            }
            "for_statement" => children(node).into_iter().filter(|part| part.kind() == "local_variable_declaration").flat_map(declarators).find(|declarator| named(*declarator)),
            "enhanced_for_statement" => (named(node) && node.child_by_field_name("value") != Some(inner)).then_some(node),
            "try_with_resources_statement" => node.child_by_field_name("resources").and_then(|resources| {
                children(resources).into_iter().find(|resource| resource.kind() == "resource" && named(*resource) && resource.start_byte() < usage.start_byte())
            }),
            "catch_clause" => children(node).into_iter().find(|part| part.kind() == "catch_formal_parameter" && named(*part)),
            "lambda_expression" | "method_declaration" | "constructor_declaration" => node.child_by_field_name("parameters").and_then(|list| parameter(file, list, name)),
            "compact_constructor_declaration" => crate::engine::source::ancestor(node, &["record_declaration"])
                .and_then(|record| record.child_by_field_name("parameters"))
                .and_then(|list| parameter(file, list, name)),
            _ => None,
        };
        let bound = || {
            let closed = CLOSED.contains(&node.kind()) || matches!(node.kind(), "field_declaration" | "static_initializer" | "compact_constructor_declaration");
            let holds = |outer: Node, part: Node| outer.start_byte() <= part.start_byte() && part.end_byte() <= outer.end_byte();
            scopes.patterns.get(name).filter(|_| closed)?.iter().rev().copied().find(|pattern| {
                let shut = crate::engine::source::ancestor(*pattern, CLOSED).filter(|around| around.id() != node.id() && holds(node, *around));
                holds(node, *pattern) && pattern.start_byte() < usage.start_byte() && shut.is_none_or(|around| holds(around, usage)) && reaches(file, *pattern, usage)
            })
        };
        if let Some(found) = found.or_else(bound) {
            return Some(Found::Local(found));
        }
        if class_at(resolver.scope, node, inner).is_some_and(|owner| resolver.index.field(&owner, name).is_some()) {
            return Some(Found::Field);
        }
        inner = node;
        scope = parent(node);
    }
    None
}

/// The static type of a local found by `declaration`, read at `usage`.
pub fn kind(resolver: &Resolver, declared: Node, usage: Node, name: &str) -> Option<Type> {
    let written = match declared.kind() {
        "instanceof_expression" => declared.child_by_field_name("right"),
        "type_pattern" | "record_pattern_component" => declared.named_child(0).filter(|written| written.kind() != "identifier"),
        _ => None,
    };
    if let Some(written) = written {
        return resolver.type_node(written);
    }
    match resolver.binding(usage, name) {
        Some(Binding::Local(kind)) => kind,
        _ => None,
    }
}

/// A `final` local of a primitive type or `String` whose value is a constant expression: the compiler puts the
/// value in place of the name, so nothing needs the variable.
pub fn constant<'t>(resolver: &Resolver, scopes: &Scopes<'t>, declarator: Node<'t>) -> bool {
    let Some(statement) = parent(declarator).filter(|statement| statement.kind() == "local_variable_declaration") else { return false };
    let simple = statement.child_by_field_name("type").is_some_and(|written| {
        matches!(written.kind(), "integral_type" | "floating_point_type" | "boolean_type") || matches!(resolver.file.text_of(written), "String" | "java.lang.String" | "var")
    });
    let Some(value) = declarator.child_by_field_name("value") else { return false };
    if !simple || !has_modifier(statement, "final") || declarator.child_by_field_name("dimensions").is_some() || !resolver.constant_shape(value, &mut Vec::new()) {
        return false;
    }
    let mut fixed = true;
    crate::engine::source::walk(value, |part| {
        let read = match part.kind() {
            "identifier" if is_use(part) && parent(part).is_none_or(|holder| holder.kind() != "field_access") => true,
            "field_access" => parent(part).is_none_or(|holder| holder.kind() != "field_access"),
            _ => false,
        };
        if read && fixed {
            fixed = match part.kind() {
                "identifier" => match declaration(resolver, scopes, part, resolver.file.text_of(part)) {
                    Some(Found::Local(other)) => other.kind() == "variable_declarator" && constant(resolver, scopes, other),
                    _ => resolver.constant_field(part),
                },
                _ => resolver.constant_field(part),
            };
        }
    });
    fixed
}
