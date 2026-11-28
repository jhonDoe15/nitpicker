//! Expressions. javac's parser folds adjacent string literals of a `+` chain into one literal, and a `-` written
//! before a decimal integer literal into a negative literal.
use super::tree::{Build, parts, token};
use crate::engine::source::children;
use tree_sitter::Node;

mod kinds;
mod patterns;
mod strings;

use kinds::{assignment_kind, binary_kind, literal_kind};

pub fn operator(node: Node) -> Option<Node> {
    node.child_by_field_name("operator")
}

impl<'c, 't> Build<'c, 't> {
    pub fn select_dot(&self, node: Node<'t>) -> Option<usize> {
        children(node).into_iter().filter(|part| part.kind() == ".").last().map(|part| part.start_byte())
    }

    /// javac's preferred position of an expression.
    pub fn pref(&self, node: Node<'t>) -> usize {
        let at = match node.kind() {
            "method_invocation" => node.child_by_field_name("arguments").map(|list| list.start_byte()),
            "field_access" | "class_literal" => self.select_dot(node),
            "binary_expression" => match self.folded(node) {
                Some(operands) => operands.last().map(Self::operand_start),
                None => operator(node).map(|found| found.start_byte()),
            },
            "assignment_expression" | "update_expression" => {
                operator(node).or_else(|| children(node).into_iter().find(|part| matches!(part.kind(), "++" | "--"))).map(|found| found.start_byte())
            }
            "unary_expression" => operator(node).map(|found| found.start_byte()),
            "array_access" => token(node, "["),
            "ternary_expression" => token(node, "?"),
            "instanceof_expression" => token(node, "instanceof"),
            "object_creation_expression" | "array_creation_expression" => token(node, "new"),
            _ => None,
        };
        at.unwrap_or(node.start_byte())
    }

    pub fn expr(&mut self, node: Node<'t>, level: usize) {
        let at = Some(self.pref(node));
        let me = Some(node);
        let text = self.text(node);
        if let Some(kind) = literal_kind(node, text) {
            self.push(level, kind, at, me);
            return;
        }
        match node.kind() {
            "identifier" | "this" | "super" | "type_identifier" => self.push(level, "IDENTIFIER", at, me),
            "parenthesized_expression" => {
                self.push(level, "PARENTHESIZED", at, me);
                for inner in parts(node) {
                    self.expr(inner, level + 1);
                }
            }
            "field_access" => {
                self.push(level, "MEMBER_SELECT", at, me);
                self.qualified(node, level + 1);
            }
            "method_invocation" => self.invocation(node, level),
            "explicit_constructor_invocation" => self.invocation(node, level),
            "object_creation_expression" => self.creation(node, level),
            "array_creation_expression" => self.new_array(node, level),
            "array_initializer" => {
                self.push(level, "NEW_ARRAY", Some(node.start_byte()), me);
                self.null(level + 1);
                for item in parts(node) {
                    self.expr(item, level + 1);
                }
            }
            "array_access" => {
                self.push(level, "ARRAY_ACCESS", at, me);
                for inner in parts(node) {
                    self.expr(inner, level + 1);
                }
            }
            "cast_expression" => {
                self.push(level, "TYPE_CAST", at, me);
                let mut cursor = node.walk();
                let types: Vec<Node<'t>> = node.children_by_field_name("type", &mut cursor).collect();
                if types.len() > 1 {
                    self.push(level + 1, "INTERSECTION_TYPE", at, None);
                    for one in types {
                        self.ty(one, level + 2);
                    }
                } else if let Some(one) = types.into_iter().next() {
                    self.ty(one, level + 1);
                }
                if let Some(value) = node.child_by_field_name("value") {
                    self.expr(value, level + 1);
                }
            }
            "binary_expression" => match self.folded(node) {
                Some(operands) => self.chain(&operands, level),
                None => {
                    let kind = binary_kind(operator(node).map_or("", |found| self.text(found)));
                    self.push(level, kind, at, me);
                    for side in ["left", "right"] {
                        if let Some(inner) = node.child_by_field_name(side) {
                            self.expr(inner, level + 1);
                        }
                    }
                }
            },
            "assignment_expression" => {
                self.push(level, assignment_kind(operator(node).map_or("", |found| self.text(found))), at, me);
                for side in ["left", "right"] {
                    if let Some(inner) = node.child_by_field_name(side) {
                        self.expr(inner, level + 1);
                    }
                }
            }
            "unary_expression" => {
                if self.negative_literal(node).is_some() {
                    let long = text.ends_with(['l', 'L']);
                    self.push(level, if long { "LONG_LITERAL" } else { "INT_LITERAL" }, at, me);
                    return;
                }
                let kind = match operator(node).map_or("", |found| self.text(found)) {
                    "-" => "UNARY_MINUS",
                    "+" => "UNARY_PLUS",
                    "!" => "LOGICAL_COMPLEMENT",
                    _ => "BITWISE_COMPLEMENT",
                };
                self.push(level, kind, at, me);
                if let Some(inner) = node.child_by_field_name("operand") {
                    self.expr(inner, level + 1);
                }
            }
            "update_expression" => {
                let first = children(node).into_iter().next();
                let prefix = first.is_some_and(|part| matches!(part.kind(), "++" | "--"));
                let increment = text.contains("++");
                let kind = match (prefix, increment) {
                    (true, true) => "PREFIX_INCREMENT",
                    (true, false) => "PREFIX_DECREMENT",
                    (false, true) => "POSTFIX_INCREMENT",
                    (false, false) => "POSTFIX_DECREMENT",
                };
                self.push(level, kind, at, me);
                for inner in parts(node) {
                    self.expr(inner, level + 1);
                }
            }
            "ternary_expression" => {
                self.push(level, "CONDITIONAL_EXPRESSION", at, me);
                for side in ["condition", "consequence", "alternative"] {
                    if let Some(inner) = node.child_by_field_name(side) {
                        self.expr(inner, level + 1);
                    }
                }
            }
            "instanceof_expression" => self.instance_of(node, level),
            "lambda_expression" => self.lambda(node, level),
            "method_reference" => {
                self.push(level, "MEMBER_REFERENCE", Some(node.start_byte()), me);
                for part in parts(node) {
                    match part.kind() {
                        "type_arguments" => {
                            for argument in parts(part) {
                                self.ty(argument, level + 1);
                            }
                        }
                        "identifier" if part.start_byte() > node.start_byte() => {}
                        _ => self.qualifier(part, level + 1),
                    }
                }
            }
            "class_literal" => {
                self.push(level, "MEMBER_SELECT", at, me);
                if let Some(written) = parts(node).into_iter().next() {
                    self.ty(written, level + 1);
                }
            }
            "switch_expression" => self.switch(node, level, "SWITCH_EXPRESSION"),
            _ if self.is_type(node) => self.ty(node, level),
            _ => self.give_up(line!()),
        }
    }

    /// A name before `::`: a type or an expression.
    pub fn qualifier(&mut self, part: Node<'t>, level: usize) {
        if self.is_type(part) { self.ty(part, level) } else { self.expr(part, level) }
    }

    /// The selected part of a field access or a call: `Outer.super.x` selects from `Outer.super`.
    pub fn qualified(&mut self, node: Node<'t>, level: usize) {
        let Some(object) = node.child_by_field_name("object") else { return };
        let constructor = node.child_by_field_name("constructor");
        let outer_super = children(node).into_iter().find(|part| part.kind() == "super" && *part != object && Some(*part) != constructor);
        match outer_super {
            Some(_) => {
                let first = children(node).into_iter().find(|part| part.kind() == ".").map(|part| part.start_byte());
                self.push(level, "MEMBER_SELECT", first, None);
                self.expr(object, level + 1);
            }
            None => self.expr(object, level),
        }
    }

    pub fn invocation(&mut self, node: Node<'t>, level: usize) {
        let open = node.child_by_field_name("arguments").map(|list| list.start_byte());
        self.push(level, "METHOD_INVOCATION", open, Some(node));
        if let Some(arguments) = node.child_by_field_name("type_arguments") {
            for argument in parts(arguments) {
                self.ty(argument, level + 1);
            }
        }
        let name = node.child_by_field_name("name").or_else(|| node.child_by_field_name("constructor"));
        match node.child_by_field_name("object") {
            Some(_) => {
                let dot = name.and_then(|name| children(node).into_iter().filter(|part| part.kind() == "." && part.start_byte() < name.start_byte()).last());
                self.push(level + 1, "MEMBER_SELECT", dot.map(|dot| dot.start_byte()), None);
                self.qualified(node, level + 2);
            }
            None => {
                let constructor = node.kind() == "explicit_constructor_invocation";
                let at = node.child_by_field_name("type_arguments").filter(|_| constructor).or(name).map(|found| found.start_byte());
                self.push(level + 1, "IDENTIFIER", at, name);
            }
        }
        for argument in node.child_by_field_name("arguments").map(parts).unwrap_or_default() {
            self.expr(argument, level + 1);
        }
    }

    pub fn creation(&mut self, node: Node<'t>, level: usize) {
        self.push(level, "NEW_CLASS", token(node, "new"), Some(node));
        let inner = level + 1;
        let skipped = ["type", "arguments", "type_arguments"];
        let enclosing = parts(node).into_iter().find(|part| {
            !skipped.iter().any(|field| node.child_by_field_name(field) == Some(*part))
                && !matches!(part.kind(), "class_body" | "annotation" | "marker_annotation")
        });
        match enclosing {
            Some(outer) => self.expr(outer, inner),
            None => self.null(inner),
        }
        if let Some(written) = node.child_by_field_name("type") {
            self.created(node, written, inner);
        }
        if let Some(arguments) = node.child_by_field_name("type_arguments") {
            for argument in parts(arguments) {
                self.ty(argument, inner);
            }
        }
        for argument in node.child_by_field_name("arguments").map(parts).unwrap_or_default() {
            self.expr(argument, inner);
        }
        match parts(node).into_iter().find(|part| part.kind() == "class_body") {
            Some(body) if enclosing.is_some() => {
                self.give_up(line!());
                self.anonymous(node, body, inner, "CLASS", None);
            }
            Some(body) => self.anonymous(node, body, inner, "CLASS", None),
            None => self.null(inner),
        }
    }

}
