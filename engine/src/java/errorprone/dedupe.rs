//! DeduplicateConstants: a string literal equal to a constant that is in scope.
use super::consts::{constant, Const};
use super::finals::assignments;
use super::fixes::Fix;
use super::Context;
use crate::engine::source::{children, named_children};
use crate::java::helpers::{declarators, has_modifier};
use tree_sitter::Node;

#[derive(Default)]
struct Scope {
    values: Vec<(String, usize, String)>,
    hidden: Vec<String>,
}

struct Scanner<'c, 'f> {
    context: &'c Context<'f>,
    scopes: Vec<Scope>,
    uses: Vec<(usize, String, Vec<(usize, usize)>)>,
}

impl Scanner<'_, '_> {
    fn get(&self, depth: usize, value: &str) -> Option<(usize, String)> {
        let scope = &self.scopes[depth];
        let found = scope.values.iter().rev().find(|entry| entry.0 == value).map(|entry| (entry.1, entry.2.clone())).or_else(|| depth.checked_sub(1).and_then(|up| self.get(up, value)))?;
        (!scope.hidden.contains(&found.1)).then_some(found)
    }

    fn hide(&mut self, name: &str) {
        let scope = self.scopes.last_mut().expect("root scope");
        scope.hidden.push(name.to_string());
    }

    fn literal(&mut self, node: Node) {
        let Some((id, name)) = self.get(self.scopes.len() - 1, self.context.text(node)) else { return };
        let span = (node.start_byte(), node.end_byte());
        match self.uses.iter_mut().find(|entry| entry.0 == id) {
            Some(entry) => entry.2.push(span),
            None => self.uses.push((id, name, vec![span])),
        }
    }

    fn save(&mut self, declarator: Node, considered_final: bool) {
        let Some(value) = declarator.child_by_field_name("value").filter(|_| considered_final) else { return };
        let Some(Const::Str(text)) = constant(self.context, value) else { return };
        if text.encode_utf16().count() <= 1 {
            return;
        }
        let Some(name) = declarator.child_by_field_name("name") else { return };
        let name = self.context.text(name).to_string();
        let scope = self.scopes.last_mut().expect("root scope");
        scope.hidden.retain(|hidden| *hidden != name);
        scope.values.retain(|entry| entry.0 != self.context.text(value));
        scope.values.push((self.context.text(value).to_string(), declarator.id(), name));
    }

    fn declarator(&mut self, declarator: Node, considered_final: bool) {
        if let Some(name) = declarator.child_by_field_name("name") {
            self.hide(self.context.text(name));
        }
        if let Some(value) = declarator.child_by_field_name("value") {
            self.scan(value);
        }
        self.save(declarator, considered_final);
    }

    fn effectively_final(&self, declaration: Node, declarator: Node) -> bool {
        if has_modifier(declaration, "final") {
            return true;
        }
        let (Some(name), Some(scope)) = (declarator.child_by_field_name("name"), crate::engine::source::parent(declaration)) else { return false };
        let (count, _) = assignments(self.context, scope, self.context.text(name), name.end_byte());
        declarator.child_by_field_name("value").is_some() && count == 0
    }

    fn parameter(&mut self, parameter: Node) {
        let name = parameter.child_by_field_name("name").or_else(|| children(parameter).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|d| d.child_by_field_name("name")));
        if let Some(name) = name {
            self.hide(self.context.text(name));
        }
    }

    /// javac's parser merges adjacent string literals of a `+` chain into one literal, which no constant can match.
    fn concatenation(&mut self, node: Node) {
        let mut operands = Vec::new();
        let mut current = node;
        loop {
            let plus = current.kind() == "binary_expression" && current.child_by_field_name("operator").is_some_and(|operator| self.context.text(operator) == "+");
            let (true, Some(left), Some(right)) = (plus, current.child_by_field_name("left"), current.child_by_field_name("right")) else { break };
            operands.push(right);
            current = left;
        }
        operands.push(current);
        operands.reverse();
        let mut at = 0;
        while at < operands.len() {
            let run = operands[at..].iter().take_while(|operand| operand.kind() == "string_literal").count();
            if run >= 2 {
                at += run;
            } else {
                self.scan(operands[at]);
                at += 1;
            }
        }
    }

    fn scan(&mut self, node: Node) {
        match node.kind() {
            "string_literal" => self.literal(node),
            "binary_expression" if node.child_by_field_name("operator").is_some_and(|operator| self.context.text(operator) == "+") => self.concatenation(node),
            "line_comment" | "block_comment" => {}
            "block" | "constructor_body" => {
                self.scopes.push(Scope::default());
                children(node).into_iter().for_each(|part| self.scan(part));
                self.scopes.pop();
            }
            "field_declaration" => declarators(node).into_iter().for_each(|part| self.declarator(part, has_modifier(node, "final"))),
            "constant_declaration" => declarators(node).into_iter().for_each(|part| self.declarator(part, true)),
            "local_variable_declaration" => {
                for part in declarators(node) {
                    let settled = self.effectively_final(node, part);
                    self.declarator(part, settled);
                }
            }
            "formal_parameter" | "spread_parameter" | "catch_formal_parameter" => self.parameter(node),
            "resource" => {
                if let Some(name) = node.child_by_field_name("name") {
                    self.hide(self.context.text(name));
                }
                if let Some(value) = node.child_by_field_name("value") {
                    self.scan(value);
                }
            }
            "enhanced_for_statement" => {
                if let Some(name) = node.child_by_field_name("name") {
                    self.hide(self.context.text(name));
                }
                for field in ["value", "body"] {
                    if let Some(part) = node.child_by_field_name(field) {
                        self.scan(part);
                    }
                }
            }
            "lambda_expression" => {
                if let Some(list) = node.child_by_field_name("parameters") {
                    match list.kind() {
                        "identifier" => self.hide(self.context.text(list)),
                        "inferred_parameters" => named_children(list).into_iter().filter(|part| part.kind() == "identifier").for_each(|part| self.hide(self.context.text(part))),
                        _ => named_children(list).into_iter().for_each(|part| self.parameter(part)),
                    }
                }
                if let Some(body) = node.child_by_field_name("body") {
                    self.scan(body);
                }
            }
            "type_pattern" => {
                if let Some(name) = children(node).into_iter().rev().find(|part| part.kind() == "identifier") {
                    self.hide(self.context.text(name));
                }
            }
            "enum_constant" => {
                if let Some(name) = node.child_by_field_name("name") {
                    self.hide(self.context.text(name));
                }
                for field in ["arguments", "body"] {
                    if let Some(part) = node.child_by_field_name(field) {
                        self.scan(part);
                    }
                }
            }
            "record_declaration" => {
                for field in ["parameters", "body"] {
                    if let Some(part) = node.child_by_field_name(field) {
                        if field == "parameters" {
                            named_children(part).into_iter().for_each(|parameter| self.parameter(parameter));
                        } else {
                            self.scan(part);
                        }
                    }
                }
            }
            _ => children(node).into_iter().for_each(|part| self.scan(part)),
        }
    }
}

pub fn deduplicate_constants(context: &Context, root: Node) {
    let mut scanner = Scanner { context, scopes: vec![Scope::default()], uses: Vec::new() };
    scanner.scan(root);
    for (_, name, spans) in &scanner.uses {
        if spans.len() < 2 {
            continue;
        }
        let mut fix = Fix::new();
        for (start, end) in spans {
            fix = fix.and(*start, *end, name.as_str());
        }
        for (start, _) in spans {
            context.report_fixed("DeduplicateConstants", root, *start, "This expression was previously declared as a constant; consider replacing this occurrence.", std::slice::from_ref(&fix));
        }
    }
}
