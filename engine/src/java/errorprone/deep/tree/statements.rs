//! Statements, in the slot order of javac's `TreeScanner`.
use super::members::is_class;
use super::{Build, Typed, parts, statements};
use crate::engine::source::children;
use tree_sitter::Node;

/// The `case` labels of a switch label: constants, patterns, `null` and `default`.
pub fn labels(label: Node) -> Vec<Node> {
    parts(label).into_iter().filter(|part| part.kind() != "guard").collect()
}

pub fn is_default(part: Node, text: &str) -> bool {
    part.kind() == "default" || (part.kind() == "identifier" && &text[part.byte_range()] == "default")
}

impl<'c, 't> Build<'c, 't> {
    pub fn optional(&mut self, node: Option<Node<'t>>, level: usize) {
        match node {
            Some(found) => self.statement(found, level),
            None => self.null(level),
        }
    }

    pub fn optional_expr(&mut self, node: Option<Node<'t>>, level: usize) {
        match node {
            Some(found) => self.expr(found, level),
            None => self.null(level),
        }
    }

    pub fn block_of(&mut self, block: Node<'t>, level: usize) {
        self.push(level, "BLOCK", Some(block.start_byte()), Some(block));
        for statement in statements(block) {
            self.statement(statement, level + 1);
        }
    }

    pub fn statement(&mut self, node: Node<'t>, level: usize) {
        let at = Some(node.start_byte());
        let field = |name: &str| node.child_by_field_name(name);
        match node.kind() {
            "block" => self.block_of(node, level),
            "local_variable_declaration" => self.fields(node, level),
            kind if is_class(node) && !kind.is_empty() => self.class(node, level, None),
            "explicit_constructor_invocation" => {
                self.push(level, "EXPRESSION_STATEMENT", at, Some(node));
                self.expr(node, level + 1);
            }
            "expression_statement" => {
                self.push(level, "EXPRESSION_STATEMENT", at, Some(node));
                for expression in parts(node) {
                    self.expr(expression, level + 1);
                }
            }
            "if_statement" => {
                self.push(level, "IF", at, Some(node));
                self.optional_expr(field("condition"), level + 1);
                self.optional(field("consequence"), level + 1);
                self.optional(field("alternative"), level + 1);
            }
            "while_statement" => {
                self.push(level, "WHILE_LOOP", at, Some(node));
                self.optional_expr(field("condition"), level + 1);
                self.optional(field("body"), level + 1);
            }
            "do_statement" => {
                self.push(level, "DO_WHILE_LOOP", at, Some(node));
                self.optional(field("body"), level + 1);
                self.optional_expr(field("condition"), level + 1);
            }
            "for_statement" => self.for_loop(node, level),
            "enhanced_for_statement" => {
                self.push(level, "ENHANCED_FOR_LOOP", at, Some(node));
                let name = field("name").map(|name| name.start_byte());
                let typed = match field("type") {
                    Some(written) if self.text(written) == "var" => self.loop_type(node),
                    Some(written) => Typed::Written(written, field("dimensions").into_iter().collect(), None),
                    None => Typed::Made(None, (1, 1)),
                };
                self.variable(node, name, level + 1, typed, None);
                self.optional_expr(field("value"), level + 1);
                self.optional(field("body"), level + 1);
            }
            "labeled_statement" => {
                self.push(level, "LABELED_STATEMENT", at, Some(node));
                let body = statements(node).into_iter().find(|part| part.kind() != "identifier");
                self.optional(body, level + 1);
            }
            "switch_expression" => self.switch(node, level, "SWITCH"),
            "return_statement" | "throw_statement" | "yield_statement" => {
                let kind = match node.kind() {
                    "return_statement" => "RETURN",
                    "throw_statement" => "THROW",
                    _ => "YIELD",
                };
                self.push(level, kind, at, Some(node));
                let value = parts(node).into_iter().next();
                match value {
                    Some(value) => self.expr(value, level + 1),
                    None if kind == "RETURN" => self.null(level + 1),
                    None => {}
                }
            }
            "break_statement" => self.push(level, "BREAK", at, Some(node)),
            "continue_statement" => self.push(level, "CONTINUE", at, Some(node)),
            ";" => self.push(level, "EMPTY_STATEMENT", at, Some(node)),
            "assert_statement" => {
                self.push(level, "ASSERT", at, Some(node));
                let mut values = parts(node).into_iter();
                self.optional_expr(values.next(), level + 1);
                self.optional_expr(values.next(), level + 1);
            }
            "synchronized_statement" => {
                self.push(level, "SYNCHRONIZED", at, Some(node));
                let lock = parts(node).into_iter().find(|part| part.kind() == "parenthesized_expression");
                self.optional_expr(lock, level + 1);
                self.optional(field("body"), level + 1);
            }
            "try_statement" | "try_with_resources_statement" => self.try_statement(node, level),
            _ => self.give_up(line!()),
        }
    }

    pub fn for_loop(&mut self, node: Node<'t>, level: usize) {
        self.push(level, "FOR_LOOP", Some(node.start_byte()), Some(node));
        let mut cursor = node.walk();
        let inits: Vec<Node<'t>> = node.children_by_field_name("init", &mut cursor).collect();
        for init in inits {
            if init.kind() == "local_variable_declaration" {
                self.fields(init, level + 1);
            } else {
                self.push(level + 1, "EXPRESSION_STATEMENT", Some(init.start_byte()), None);
                self.expr(init, level + 2);
            }
        }
        self.optional_expr(node.child_by_field_name("condition"), level + 1);
        let mut cursor = node.walk();
        let updates: Vec<Node<'t>> = node.children_by_field_name("update", &mut cursor).collect();
        for update in updates {
            self.push(level + 1, "EXPRESSION_STATEMENT", Some(update.start_byte()), None);
            self.expr(update, level + 2);
        }
        self.optional(node.child_by_field_name("body"), level + 1);
    }

    pub fn try_statement(&mut self, node: Node<'t>, level: usize) {
        self.push(level, "TRY", Some(node.start_byte()), Some(node));
        for resource in node.child_by_field_name("resources").map(parts).unwrap_or_default() {
            match resource.child_by_field_name("type") {
                Some(written) => {
                    let name = resource.child_by_field_name("name").map(|name| name.start_byte());
                    let typed = if self.text(written) == "var" {
                        self.resource_type(resource)
                    } else {
                        Typed::Written(written, resource.child_by_field_name("dimensions").into_iter().collect(), None)
                    };
                    self.variable(resource, name, level + 1, typed, resource.child_by_field_name("value"));
                }
                None => {
                    for expression in parts(resource) {
                        self.expr(expression, level + 1);
                    }
                }
            }
        }
        self.optional(node.child_by_field_name("body"), level + 1);
        let clauses = parts(node);
        for clause in clauses.iter().filter(|part| part.kind() == "catch_clause") {
            self.push(level + 1, "CATCH", Some(clause.start_byte()), Some(*clause));
            match parts(*clause).into_iter().find(|part| part.kind() == "catch_formal_parameter") {
                Some(parameter) => self.catch_parameter(parameter, level + 2),
                None => self.give_up(line!()),
            }
            self.optional(clause.child_by_field_name("body"), level + 2);
        }
        let finally = clauses.iter().find(|part| part.kind() == "finally_clause").and_then(|clause| parts(*clause).into_iter().next());
        self.optional(finally, level + 1);
    }

    pub fn catch_parameter(&mut self, parameter: Node<'t>, level: usize) {
        let name = parameter.child_by_field_name("name").map(|name| name.start_byte());
        self.push(level, "VARIABLE", name, Some(parameter));
        if self.suppressed(parameter) {
            return;
        }
        self.modifiers(parameter, level + 1, None, &[]);
        let caught = parts(parameter).into_iter().find(|part| part.kind() == "catch_type");
        if caught.is_some_and(|caught| self.masked(caught, caught.start_byte(), caught.end_byte())) {
            self.give_up(line!());
        }
        let types = caught.map(parts).unwrap_or_default();
        if types.len() > 1 {
            self.push(level + 1, "UNION_TYPE", Some(types[0].start_byte()), None);
            for one in types {
                self.ty(one, level + 2);
            }
        } else if let Some(one) = types.into_iter().next() {
            self.ty(one, level + 1);
        }
        self.null(level + 1);
        self.null(level + 1);
    }

    /// A switch: the selector, then a case per label (`case 1: case 2:` are two) or per rule.
    pub fn switch(&mut self, node: Node<'t>, level: usize, kind: &'static str) {
        self.push(level, kind, Some(node.start_byte()), Some(node));
        self.optional_expr(node.child_by_field_name("condition"), level + 1);
        let expression = kind == "SWITCH_EXPRESSION";
        for group in node.child_by_field_name("body").map(parts).unwrap_or_default() {
            let items = statements(group);
            let labels: Vec<Node<'t>> = items.iter().copied().filter(|part| part.kind() == "switch_label").collect();
            let rest: Vec<Node<'t>> = items.iter().copied().filter(|part| part.kind() != "switch_label").collect();
            for (index, label) in labels.iter().enumerate() {
                let last = index + 1 == labels.len();
                self.case(*label, level + 1, if last { &rest } else { &[] }, group.kind() == "switch_rule", expression);
            }
        }
    }

    pub fn case(&mut self, label: Node<'t>, level: usize, body: &[Node<'t>], rule: bool, expression: bool) {
        self.push(level, "CASE", Some(label.start_byte()), Some(label));
        let inner = level + 1;
        let text = &self.context.file.text;
        let found: Vec<Node<'t>> = labels(label).into_iter().filter(|part| !is_default(*part, text)).collect();
        let default = children(label).iter().any(|part| is_default(*part, text));
        for one in &found {
            match one.kind() {
                "pattern" | "type_pattern" | "record_pattern" => {
                    self.push(inner, "PATTERN_CASE_LABEL", Some(one.start_byte()), Some(*one));
                    self.pattern(*one, inner + 1);
                }
                _ => {
                    self.push(inner, "CONSTANT_CASE_LABEL", Some(one.start_byte()), Some(*one));
                    self.expr(*one, inner + 1);
                }
            }
        }
        if default {
            let at = children(label).into_iter().find(|part| is_default(*part, text)).map(|part| part.start_byte());
            self.push(inner, "DEFAULT_CASE_LABEL", at, None);
        }
        let guard = parts(label).into_iter().find(|part| part.kind() == "guard").and_then(|guard| parts(guard).into_iter().next());
        self.optional_expr(guard, inner);
        for statement in body {
            match statement.kind() {
                "expression_statement" if rule && expression => {
                    for value in parts(*statement) {
                        self.expr(value, inner);
                    }
                }
                "expression_statement" if rule => {
                    self.push(inner, "EXPRESSION_STATEMENT", Some(statement.start_byte()), Some(*statement));
                    for value in parts(*statement) {
                        self.expr(value, inner + 1);
                    }
                }
                _ => self.statement(*statement, inner),
            }
        }
    }
}
