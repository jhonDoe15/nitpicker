//! Statements: values that meet after branches and loops, and the members of classes declared inside a method.
use super::values::Walk;
use crate::engine::source::{children, named_children};
use std::collections::HashSet;
use tree_sitter::Node;

const CLASSES: &[&str] = &["class_declaration", "record_declaration", "enum_declaration", "interface_declaration", "local_class_declaration"];

/// Names of the locals and fields a loop stores to, and whether it enters a monitor.
fn stored(context: &super::super::Context, node: Node, names: &mut HashSet<String>, monitor: &mut bool) {
    match node.kind() {
        "lambda_expression" | "class_body" => return,
        "synchronized_statement" => *monitor = true,
        "assignment_expression" => {
            let target = node.child_by_field_name("left");
            let named = target.and_then(|target| if target.kind() == "field_access" { target.child_by_field_name("field") } else { Some(target) });
            names.extend(named.filter(|named| named.kind() == "identifier").map(|named| context.text(named).to_string()));
        }
        "update_expression" => {
            names.extend(named_children(node).into_iter().filter(|part| part.kind() == "identifier").map(|part| context.text(part).to_string()));
        }
        _ => {}
    }
    for part in named_children(node) {
        stored(context, part, names, monitor);
    }
}

impl<'c, 'a> Walk<'c, 'a> {
    /// At the head of a loop everything the loop stores holds a value merged from each pass.
    fn loop_head(&mut self, node: Node) {
        let (mut names, mut monitor) = (HashSet::new(), false);
        stored(self.context, node, &mut names, &mut monitor);
        let mut locals = std::mem::take(&mut self.env.locals);
        for local in locals.iter_mut().filter(|local| names.contains(&*local.name)) {
            local.value = self.fresh(super::values::Origin::Plain);
            local.kind = local.declared.clone().or(local.kind.take());
        }
        self.env.locals = locals;
        if monitor {
            self.env.loads.clear();
        }
        self.env.loads.retain(|load| !names.contains(&load.2));
    }

    fn branch(&mut self, node: Option<Node<'a>>) -> (bool, super::values::Env) {
        let before = self.env.clone();
        let completes = node.is_none_or(|node| self.statement(node));
        (completes, std::mem::replace(&mut self.env, before))
    }

    fn join(&mut self, paths: Vec<(bool, super::values::Env)>) {
        let mut open = paths.into_iter().filter(|path| path.0).map(|path| path.1);
        let Some(first) = open.next() else { return };
        self.env = first;
        for other in open {
            self.merge(other);
        }
    }

    /// Walks a statement; whether it can complete normally.
    pub fn statement(&mut self, node: Node<'a>) -> bool {
        let context = self.context;
        let part = |field: &str| node.child_by_field_name(field);
        match node.kind() {
            "block" | "constructor_body" | "switch_block_statement_group" => {
                let mark = self.env.locals.len();
                let mut completes = true;
                for statement in named_children(node).into_iter().filter(|statement| !statement.kind().ends_with("comment")) {
                    if matches!(statement.kind(), "switch_label") {
                        continue;
                    }
                    completes = self.statement(statement);
                }
                self.env.locals.truncate(mark);
                completes
            }
            "local_variable_declaration" => {
                let declared = part("type").and_then(|kind| context.resolver.type_node(kind)).filter(|_| context.text(part("type").unwrap_or(node)) != "var");
                for declarator in crate::java::helpers::declarators(node) {
                    let Some(name) = declarator.child_by_field_name("name") else { continue };
                    let value = match declarator.child_by_field_name("value") {
                        Some(value) => {
                            let found = self.eval(value);
                            self.boxed(found, declared.as_ref())
                        }
                        None => self.plain(declared.clone()),
                    };
                    let value = if value.1.is_none() { (value.0, declared.clone()) } else { value };
                    self.declare(context.text(name), value, declared.clone());
                }
                true
            }
            "if_statement" => {
                if let Some(condition) = part("condition") {
                    self.eval(condition);
                }
                let then = self.branch(part("consequence"));
                let otherwise = self.branch(part("alternative"));
                let completes = then.0 || otherwise.0;
                self.join(vec![then, otherwise]);
                completes
            }
            "while_statement" | "do_statement" => {
                self.loop_head(node);
                let after = self.env.clone();
                if node.kind() == "while_statement" {
                    self.eval(part("condition").unwrap_or(node));
                }
                self.branch(part("body"));
                if node.kind() == "do_statement" {
                    self.eval(part("condition").unwrap_or(node));
                }
                self.env = after;
                true
            }
            "for_statement" | "enhanced_for_statement" => {
                let mark = self.env.locals.len();
                for init in children(node).into_iter().filter(|child| node.field_name_for_child(child_index(node, *child)) == Some("init")) {
                    self.statement(init);
                }
                if let Some(value) = part("value") {
                    self.eval(value);
                }
                self.loop_head(node);
                if node.kind() == "enhanced_for_statement" {
                    if let Some(name) = part("name") {
                        let declared = part("type").and_then(|kind| context.resolver.type_node(kind));
                        let value = self.plain(declared.clone());
                        self.declare(context.text(name), value, declared);
                    }
                }
                let after = self.env.clone();
                if let Some(condition) = part("condition") {
                    self.eval(condition);
                }
                self.branch(part("body"));
                for update in children(node).into_iter().filter(|child| node.field_name_for_child(child_index(node, *child)) == Some("update")) {
                    self.eval(update);
                }
                self.env = after;
                self.env.locals.truncate(mark);
                true
            }
            "switch_statement" => {
                self.switch(node);
                true
            }
            "try_statement" | "try_with_resources_statement" => self.attempt(node),
            "synchronized_statement" => {
                for child in named_children(node).into_iter().filter(|child| child.kind() == "parenthesized_expression") {
                    self.eval(child);
                }
                self.env.loads.clear();
                let completes = part("body").is_none_or(|body| self.statement(body));
                self.env.loads.clear();
                completes
            }
            "labeled_statement" => named_children(node).into_iter().filter(|child| child.kind() != "identifier").fold(true, |_, inner| self.statement(inner)),
            "return_statement" | "throw_statement" | "yield_statement" => {
                for child in named_children(node) {
                    self.eval(child);
                }
                false
            }
            "break_statement" | "continue_statement" => false,
            "assert_statement" => {
                let before = self.env.clone();
                for child in named_children(node) {
                    self.eval(child);
                }
                self.env = before;
                true
            }
            "expression_statement" | "explicit_constructor_invocation" => {
                for child in named_children(node) {
                    self.eval(child);
                }
                true
            }
            kind if CLASSES.contains(&kind) => {
                if let Some(body) = part("body") {
                    self.class_body(body);
                }
                true
            }
            ";" | "empty_statement" => true,
            _ => {
                self.eval(node);
                true
            }
        }
    }

    pub fn switch(&mut self, node: Node<'a>) {
        if let Some(condition) = node.child_by_field_name("condition") {
            self.eval(condition);
        }
        let Some(body) = node.child_by_field_name("body") else { return };
        let mut paths = vec![(true, self.env.clone())];
        for group in named_children(body) {
            let before = self.env.clone();
            let completes = match group.kind() {
                "switch_rule" => named_children(group).into_iter().filter(|child| child.kind() != "switch_label").fold(true, |_, child| self.statement(child)),
                _ => self.statement(group),
            };
            paths.push((completes || group.kind() == "switch_rule", std::mem::replace(&mut self.env, before)));
        }
        self.join(paths);
    }

    fn attempt(&mut self, node: Node<'a>) -> bool {
        let mark = self.env.locals.len();
        if let Some(resources) = node.child_by_field_name("resources") {
            for resource in named_children(resources) {
                let value = resource.child_by_field_name("value").map(|value| self.eval(value));
                if let (Some(name), Some(value)) = (resource.child_by_field_name("name"), value) {
                    self.declare(self.context.text(name), value, None);
                }
            }
        }
        let mut entry = self.env.clone();
        let body = node.child_by_field_name("body");
        let tried = self.branch(body);
        let before = std::mem::replace(&mut self.env, entry.clone());
        if let Some(body) = body {
            self.loop_head(body);
            entry = std::mem::replace(&mut self.env, before);
        }
        let mut paths = vec![tried];
        let mut finally = None;
        for clause in named_children(node) {
            match clause.kind() {
                "catch_clause" => {
                    let before = std::mem::replace(&mut self.env, entry.clone());
                    let parameter = children(clause).into_iter().find(|child| child.kind() == "catch_formal_parameter");
                    if let Some(name) = parameter.and_then(|parameter| parameter.child_by_field_name("name")) {
                        let value = self.plain(None);
                        self.declare(self.context.text(name), value, None);
                    }
                    let completes = clause.child_by_field_name("body").is_none_or(|body| self.statement(body));
                    paths.push((completes, std::mem::replace(&mut self.env, before)));
                }
                "finally_clause" => finally = named_children(clause).into_iter().find(|child| child.kind() == "block"),
                _ => {}
            }
        }
        let completes = paths.iter().any(|path| path.0);
        self.join(paths);
        self.env.locals.truncate(mark);
        let finished = finally.is_none_or(|block| self.statement(block));
        completes && finished
    }
}

fn child_index(node: Node, child: Node) -> u32 {
    children(node).iter().position(|candidate| candidate.id() == child.id()).unwrap_or_default() as u32
}
