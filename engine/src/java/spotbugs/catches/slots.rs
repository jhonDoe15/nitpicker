//! The local variable slots javac gives the parameters and locals of a method: `this` first, then the parameters,
//! then each local in order of declaration, a slot freed when its block ends; `long` and `double` take two. The
//! hidden locals of a for-each loop and a `synchronized` block take theirs before the loop variable.
use crate::engine::source::{children, parent};
use crate::java::helpers::{declarators, has_modifier};
use std::collections::HashMap;
use tree_sitter::Node;

const MEMBERS: &[&str] = &["method_declaration", "constructor_declaration", "compact_constructor_declaration", "lambda_expression", "static_initializer"];

pub struct Slots {
    /// The slot of each declarator, parameter, catch parameter, resource and loop, and the first free slot at
    /// each `return`.
    by_declaration: HashMap<usize, usize>,
}

fn width(context: &super::super::Context, kind: Option<Node>) -> usize {
    kind.map_or(1, |kind| if matches!(context.text(kind), "long" | "double") { 2 } else { 1 })
}

struct Count<'c, 'a> {
    context: &'c super::super::Context<'a>,
    next: usize,
    by_declaration: HashMap<usize, usize>,
}

impl Count<'_, '_> {
    fn take(&mut self, declaration: Node, kind: Option<Node>) {
        self.by_declaration.insert(declaration.id(), self.next);
        self.next += width(self.context, kind);
    }

    fn scoped(&mut self, node: Node, inside: impl FnOnce(&mut Self, Node)) {
        let kept = self.next;
        inside(self, node);
        self.next = kept;
    }

    fn visit(&mut self, node: Node) {
        match node.kind() {
            "lambda_expression" | "class_body" => {}
            "block" | "switch_block_statement_group" | "for_statement" | "catch_clause" | "switch_rule" | "try_with_resources_statement" => self.scoped(node, |count, node| count.parts(node)),
            "local_variable_declaration" => {
                let kind = node.child_by_field_name("type");
                for declarator in declarators(node) {
                    if let Some(value) = declarator.child_by_field_name("value") {
                        self.visit(value);
                    }
                    let inferred = kind.is_some_and(|kind| self.context.text(kind) == "var");
                    let wide = inferred && declarator.child_by_field_name("value").and_then(|value| self.context.resolver.type_of(value)).is_some_and(|value| matches!(value, crate::java::types::model::Type::Primitive("long" | "double")));
                    self.by_declaration.insert(declarator.id(), self.next);
                    self.next += if inferred { 1 + usize::from(wide) } else { width(self.context, kind) };
                }
            }
            "catch_formal_parameter" => self.take(node, None),
            "return_statement" => {
                self.parts(node);
                self.by_declaration.insert(node.id(), self.next);
            }
            "resource" => {
                self.parts(node);
                if node.child_by_field_name("name").is_some() {
                    self.take(node, node.child_by_field_name("type"));
                }
            }
            "enhanced_for_statement" => self.scoped(node, |count, node| {
                if let Some(value) = node.child_by_field_name("value") {
                    count.visit(value);
                }
                let array = node.child_by_field_name("value").and_then(|value| count.context.resolver.type_of(value)).is_some_and(|kind| matches!(kind, crate::java::types::model::Type::Array(_)));
                count.next += if array { 3 } else { 1 };
                count.take(node, node.child_by_field_name("type"));
                if let Some(body) = node.child_by_field_name("body") {
                    count.visit(body);
                }
            }),
            "synchronized_statement" => self.scoped(node, |count, node| {
                count.next += 1;
                count.parts(node);
            }),
            "instanceof_expression" if node.child_by_field_name("name").is_some() => {
                self.parts(node);
                self.take(node, node.child_by_field_name("right"));
            }
            _ => self.parts(node),
        }
    }

    fn parts(&mut self, node: Node) {
        for part in children(node) {
            self.visit(part);
        }
    }
}

impl Slots {
    /// The slots of the method, constructor or lambda around a node.
    pub fn of(context: &super::super::Context, at: Node) -> Slots {
        let mut count = Count { context, next: 0, by_declaration: HashMap::new() };
        let mut around = parent(at);
        let member = loop {
            let Some(node) = around else { return Slots { by_declaration: count.by_declaration } };
            let initializer = node.kind() == "block" && parent(node).is_some_and(|holder| holder.kind() == "class_body");
            if initializer || MEMBERS.contains(&node.kind()) {
                break node;
            }
            around = parent(node);
        };
        let is_static = member.kind() == "static_initializer" || (member.kind() == "method_declaration" && has_modifier(member, "static"));
        let enum_constructor = member.kind() == "constructor_declaration" && crate::engine::source::ancestor(member, &["enum_declaration", "class_declaration"]).is_some_and(|class| class.kind() == "enum_declaration");
        count.next = usize::from(!is_static && member.kind() != "lambda_expression") + 2 * usize::from(enum_constructor);
        if let Some(list) = member.child_by_field_name("parameters") {
            if list.kind() == "identifier" {
                count.take(list, None);
            }
            for parameter in children(list).into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter" | "identifier")) {
                count.take(parameter, parameter.child_by_field_name("type"));
            }
        }
        if let Some(body) = member.child_by_field_name("body").or_else(|| (member.kind() != "lambda_expression").then_some(member)) {
            count.visit(body);
        }
        Slots { by_declaration: count.by_declaration }
    }

    pub fn slot(&self, declaration: Node) -> Option<usize> {
        self.by_declaration.get(&declaration.id()).copied()
    }
}
