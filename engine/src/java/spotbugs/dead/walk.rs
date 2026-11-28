//! The walk over the statements and expressions javac gives slots of their own: loops over arrays and
//! collections, `try` with its resources and handlers, `switch`, and the classes and lambdas inside a method.
use super::slots::{Kind, Walker};
use crate::engine::source::{children, named_children};
use crate::java::types::model::Type;
use tree_sitter::Node;

impl<'a> Walker<'_, 'a> {
    pub(super) fn each(&mut self, node: Node<'a>) {
        let (next, depth) = (self.next, self.scope.len());
        let value = node.child_by_field_name("value");
        let array = value.and_then(|value| self.context.resolver.type_of(value)).is_some_and(|kind| matches!(kind, Type::Array(_)));
        let hidden = self.hide(if array { 3 } else { 1 });
        value.into_iter().for_each(|value| self.expression(value));
        for slot in &hidden {
            self.count(*slot, false);
        }
        if array {
            self.count(hidden[2], true);
        }
        self.layout.hidden.insert(node.id(), hidden);
        if let Some(name) = node.child_by_field_name("name") {
            let ty = node.child_by_field_name("type").and_then(|written| self.context.resolver.type_node(written));
            let index = self.declare(node, name, ty, Kind::Each);
            let slot = self.layout.vars[index].slot;
            self.count(slot, false);
        }
        node.child_by_field_name("body").into_iter().for_each(|body| self.statement(body));
        self.next = next;
        self.scope.truncate(depth);
    }

    pub(super) fn guarded(&mut self, node: Node<'a>) {
        let (next, depth) = (self.next, self.scope.len());
        let clauses: Vec<Node> = children(node).into_iter().filter(|part| part.kind() == "catch_clause").collect();
        if let Some(resources) = node.child_by_field_name("resources") {
            for resource in named_children(resources).into_iter().filter(|part| part.kind() == "resource") {
                let value = resource.child_by_field_name("value");
                let ty = resource.child_by_field_name("type").and_then(|written| self.context.resolver.type_node(written));
                match resource.child_by_field_name("name") {
                    Some(name) => {
                        let index = self.declare(resource, name, ty, Kind::Resource);
                        self.scope.pop();
                        value.into_iter().for_each(|value| self.expression(value));
                        self.scope.push((self.layout.vars[index].name.clone(), Some(index)));
                        let slot = self.layout.vars[index].slot;
                        self.count(slot, false);
                    }
                    None => {
                        let parts = named_children(resource);
                        parts.iter().for_each(|part| self.expression(*part));
                        let copy = self.hide(1);
                        self.count(copy[0], false);
                        if let Some(last) = parts.last() {
                            self.layout.hidden.insert(last.id(), copy);
                        }
                    }
                }
            }
        }
        node.child_by_field_name("body").into_iter().for_each(|body| self.scoped(body));
        self.next = next;
        self.scope.truncate(depth);
        for clause in &clauses {
            let parameter = children(*clause).into_iter().find(|part| part.kind() == "catch_formal_parameter");
            let name = parameter.and_then(|parameter| parameter.child_by_field_name("name"));
            if let (Some(parameter), Some(name)) = (parameter, name) {
                let ty = children(parameter).into_iter().find(|part| part.kind() == "catch_type").and_then(|written| {
                    let first = named_children(written).into_iter().next()?;
                    self.context.resolver.type_node(first)
                });
                let index = self.declare(parameter, name, ty, Kind::Catch);
                let slot = self.layout.vars[index].slot;
                self.count(slot, false);
            }
            clause.child_by_field_name("body").into_iter().for_each(|body| self.scoped(body));
            self.next = next;
            self.scope.truncate(depth);
        }
        if let Some(last) = children(node).into_iter().find(|part| part.kind() == "finally_clause") {
            let times = self.times;
            let body = node.child_by_field_name("body");
            let ends = body.into_iter().chain(clauses.iter().filter_map(|clause| clause.child_by_field_name("body")));
            let copies: u32 = ends.map(|end| super::slots::completes(end) as u32 + exits(end)).sum();
            self.times *= 1 + copies;
            named_children(last).into_iter().for_each(|body| self.scoped(body));
            self.times = times;
        }
    }

    pub(super) fn switch(&mut self, node: Node<'a>) {
        let (next, depth) = (self.next, self.scope.len());
        let condition = node.child_by_field_name("condition");
        condition.into_iter().for_each(|condition| self.expression(condition));
        let selector = condition.and_then(|condition| self.context.resolver.type_of(condition));
        let body = node.child_by_field_name("body");
        let cases: Vec<Node> = body.map(named_children).unwrap_or_default();
        let patterns = cases.iter().any(|case| {
            children(*case).into_iter().filter(|part| part.kind() == "switch_label").any(|label| {
                children(label).into_iter().any(|part| matches!(part.kind(), "type_pattern" | "record_pattern" | "pattern"))
            })
        });
        let text = matches!(&selector, Some(Type::Class(name, _)) if name == "java.lang.String");
        let plain = matches!(&selector, Some(Type::Primitive(_)))
            || matches!(&selector, Some(Type::Class(name, _)) if self.context.resolver.index.get(name).is_some_and(|info| info.enum_constants.is_some()));
        if text || patterns || !plain && selector.is_some() && !boxed(&selector) {
            let temps = self.hide(2);
            temps.iter().for_each(|slot| self.count(*slot, false));
            if let Some(condition) = condition {
                self.layout.hidden.insert(condition.id(), temps);
            }
        }
        for case in cases {
            match case.kind() {
                "switch_block_statement_group" => {
                    for part in named_children(case) {
                        if part.kind() == "switch_label" { self.hoist(part) } else { self.statement(part) }
                    }
                }
                "switch_rule" => {
                    let (inner, scope) = (self.next, self.scope.len());
                    for part in named_children(case) {
                        match part.kind() {
                            "switch_label" => self.hoist(part),
                            "block" => self.scoped(part),
                            "expression_statement" | "throw_statement" => self.statement(part),
                            _ => self.expression(part),
                        }
                    }
                    self.next = inner;
                    self.scope.truncate(scope);
                }
                _ => {}
            }
        }
        self.next = next;
        self.scope.truncate(depth);
    }

    /// A class body inside the method: its names shadow the method's, and what it reads of the method's
    /// variables are reads where the class is made.
    pub(super) fn foreign(&mut self, node: Node<'a>) {
        let mut declared: Vec<(String, usize, usize, usize)> = Vec::new();
        let context = self.context;
        crate::engine::source::walk(node, |part| {
            let holder = crate::engine::source::parent(part);
            let mut add = |name: Node, scope: Option<Node>, start: usize| {
                if let Some(scope) = scope {
                    declared.push((context.text(name).to_string(), scope.start_byte(), scope.end_byte(), start));
                }
            };
            match part.kind() {
                "variable_declarator" => {
                    let statement = holder.filter(|holder| holder.kind() == "local_variable_declaration");
                    let scope = statement.and_then(crate::engine::source::parent).or_else(|| holder.and_then(crate::engine::source::parent));
                    let start = if statement.is_some() { part.start_byte() } else { 0 };
                    part.child_by_field_name("name").into_iter().for_each(|name| add(name, scope, start));
                }
                "formal_parameter" | "spread_parameter" => {
                    let name = part.child_by_field_name("name").or_else(|| children(part).into_iter().find(|inner| inner.kind() == "variable_declarator").and_then(|inner| inner.child_by_field_name("name")));
                    name.into_iter().for_each(|name| add(name, holder.and_then(crate::engine::source::parent), 0));
                }
                "lambda_expression" => {
                    let listed = part.child_by_field_name("parameters");
                    let names: Vec<Node> = match listed {
                        Some(single) if single.kind() == "identifier" => vec![single],
                        Some(list) if list.kind() == "inferred_parameters" => named_children(list).into_iter().filter(|inner| inner.kind() == "identifier").collect(),
                        _ => Vec::new(),
                    };
                    names.into_iter().for_each(|name| add(name, Some(part), 0));
                }
                "catch_formal_parameter" => part.child_by_field_name("name").into_iter().for_each(|name| add(name, holder, 0)),
                "enhanced_for_statement" | "resource" | "instanceof_expression" | "type_pattern" | "record_pattern_component" => {
                    let pattern = matches!(part.kind(), "type_pattern" | "record_pattern_component");
                    let last = || children(part).into_iter().filter(|inner| inner.kind() == "identifier").last();
                    let name = if pattern { last() } else { part.child_by_field_name("name") };
                    let scope = crate::engine::source::ancestor(part, &["block", "lambda_expression"]);
                    name.into_iter().for_each(|name| add(name, scope, part.start_byte()));
                }
                _ => {}
            }
        });
        let mut found = Vec::new();
        crate::engine::source::walk(node, |part| {
            if part.kind() == "identifier" && crate::java::javac::locals::is_use(part) {
                found.push(part);
            }
        });
        for part in found {
            let name = self.context.text(part);
            let at = part.start_byte();
            if declared.iter().any(|(known, from, to, start)| known == name && *from <= at && at < *to && *start <= at) {
                continue;
            }
            if let Some(var) = self.lookup(part) {
                self.layout.uses.insert(part.id(), var);
            }
        }
    }

    /// The variable a name stands for: the innermost one declared, a pattern variable only past its pattern.
    fn lookup(&self, node: Node) -> Option<usize> {
        let name = self.context.text(node);
        let layout = &self.layout;
        let early = |var: &usize| layout.vars[*var].kind == Kind::Pattern && layout.vars[*var].decl.start_byte() > node.start_byte();
        let found = self.scope.iter().rev().find(|(known, var)| known == name && !var.as_ref().is_some_and(early));
        found.and_then(|(_, var)| *var)
    }

    pub(super) fn expression(&mut self, node: Node<'a>) {
        match node.kind() {
            "lambda_expression" | "class_body" => return self.foreign(node),
            "switch_expression" => return self.switch(node),
            "identifier" => {
                if crate::java::javac::locals::is_use(node) {
                    if let Some(var) = self.lookup(node) {
                        self.layout.uses.insert(node.id(), var);
                    }
                }
                return;
            }
            "assignment_expression" | "update_expression" => {
                named_children(node).into_iter().for_each(|part| self.expression(part));
                let target = super::value::target(node).and_then(|target| self.layout.uses.get(&target.id()).copied());
                if let Some(var) = target {
                    let slot = self.layout.vars[var].slot;
                    self.count(slot, super::value::increment(self.context, &self.layout, node));
                }
                return;
            }
            _ => {}
        }
        for part in children(node) {
            if part.is_named() {
                self.expression(part);
            }
        }
    }
}

fn boxed(selector: &Option<Type>) -> bool {
    const BOXES: &[&str] = &["java.lang.Integer", "java.lang.Character", "java.lang.Short", "java.lang.Byte"];
    matches!(selector, Some(Type::Class(name, _)) if BOXES.contains(&name.as_str()))
}

/// The jumps out of a `try` body or handler that run the `finally` body on the way: each gets a copy of it.
fn exits(node: Node) -> u32 {
    match node.kind() {
        "return_statement" | "break_statement" | "continue_statement" => 1,
        "lambda_expression" | "class_body" => 0,
        "while_statement" | "for_statement" | "enhanced_for_statement" | "do_statement" | "switch_expression" => {
            named_children(node).into_iter().map(returns).sum()
        }
        _ => named_children(node).into_iter().map(exits).sum(),
    }
}

fn returns(node: Node) -> u32 {
    match node.kind() {
        "return_statement" => 1,
        "lambda_expression" | "class_body" => 0,
        _ => named_children(node).into_iter().map(returns).sum(),
    }
}
