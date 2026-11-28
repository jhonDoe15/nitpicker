//! The bytes of each expression and statement, for `size.rs`, and the ranges of a `try`.
use super::super::Context;
use super::size::{Size, literal};
use super::slots::Slots;
use crate::engine::source::{children, named_children};
use crate::java::javac::locals::Scopes;
use crate::java::types::model::Type;
use tree_sitter::Node;

const LARGE: usize = 1000;
const LOOPS: &[&str] = &["for_statement", "enhanced_for_statement", "while_statement", "do_statement"];

impl<'t> Size<'_, '_, 't> {
    pub(super) fn expression(&self, node: Node<'t>) -> usize {
        let text = self.context.text(node);
        let field = |name: &str| node.child_by_field_name(name);
        match node.kind() {
            "parenthesized_expression" => node.named_child(0).map_or(0, |inner| self.expression(inner)),
            "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" => literal(text, node.kind()),
            "decimal_floating_point_literal" | "hex_floating_point_literal" => {
                let float = text.ends_with(['f', 'F']);
                let small = matches!(text.trim_end_matches(['f', 'F', 'd', 'D']), "0.0" | "1.0" | "0" | "1" | "0." | "1.") || (float && text.starts_with("2.0"));
                if small { 1 } else if float { 2 } else { 3 }
            }
            "true" | "false" | "null_literal" | "this" => 1,
            "character_literal" => {
                let value = text.trim_matches('\'').chars().next().map_or(0, u32::from);
                if text.len() == 3 && value <= 5 { 1 } else if value < 128 || text.contains('\\') { 2 } else { 3 }
            }
            "string_literal" | "text_block" | "class_literal" => 2,
            "identifier" => self.name(node),
            "field_access" => {
                if self.context.resolver.constant_field(node) {
                    return 2;
                }
                let object = field("object");
                let length = field("field").is_some_and(|name| self.context.text(name) == "length") && object.and_then(|object| self.kind(object)).is_some_and(|kind| matches!(kind, Type::Array(_)));
                let class = object.is_some_and(|object| {
                    let name = self.context.text(object);
                    let bound = object.kind() == "identifier" && self.context.resolver.binding(object, name).is_some();
                    !bound && matches!(object.kind(), "identifier" | "field_access" | "scoped_identifier") && self.context.resolver.class_name(object, name).is_some()
                });
                let base = object.filter(|_| !class).map_or(0, |object| self.expression(object));
                base + if length { 1 } else { 3 }
            }
            "method_invocation" => self.call(node),
            "object_creation_expression" => 7 + self.arguments(node) + field("object").map_or(0, |object| self.value(object) + 5),
            "explicit_constructor_invocation" => 4 + self.arguments(node),
            "assignment_expression" => self.assignment(node, true),
            "update_expression" => self.update(node, true),
            "binary_expression" => {
                let operator = field("operator").map_or("", |operator| self.context.text(operator));
                if operator == "+" && self.kind(node).is_some_and(|kind| kind.name() == "java.lang.String") {
                    return self.concatenation(node);
                }
                if matches!(operator, "&&" | "||") || super::size::COMPARISONS.contains(&operator) {
                    return self.condition(node) + 5;
                }
                if self.constant(node) {
                    return 2;
                }
                field("left").map_or(0, |left| self.operand(left)) + field("right").map_or(0, |right| self.operand(right)) + 1
            }
            "unary_expression" => {
                let operator = field("operator").map_or("", |operator| self.context.text(operator));
                let operand = field("operand");
                match operator {
                    "!" => operand.map_or(0, |operand| self.condition(operand)) + 5,
                    "-" if operand.is_some_and(|operand| operand.kind().ends_with("literal")) => literal(&format!("-{}", operand.map_or("", |operand| self.context.text(operand))), "decimal_integer_literal"),
                    "+" => operand.map_or(0, |operand| self.operand(operand)),
                    "~" => operand.map_or(0, |operand| self.operand(operand)) + 2,
                    _ => operand.map_or(0, |operand| self.operand(operand)) + 1,
                }
            }
            "cast_expression" => {
                let value = field("value").map_or(0, |value| self.value(value));
                let target = field("type").and_then(|kind| self.context.resolver.type_node(kind));
                let from = field("value").and_then(|value| self.kind(value));
                let step = match (target, from) {
                    (Some(Type::Primitive(to)), Some(Type::Primitive(from))) => usize::from(to != from && !(matches!(to, "int") && matches!(from, "short" | "byte" | "char"))),
                    (Some(Type::Primitive(_)), _) => 3,
                    (Some(to), Some(from)) => 3 * usize::from(!self.context.resolver.assignable(&from, &to, true)),
                    _ => 3,
                };
                value + step
            }
            "instanceof_expression" => field("left").map_or(0, |left| self.value(left)) + 3 + field("name").map_or(0, |_| 11),
            "ternary_expression" => field("condition").map_or(0, |condition| self.condition(condition)) + field("consequence").map_or(0, |part| self.value(part)) + 3 + field("alternative").map_or(0, |part| self.value(part)),
            "array_access" => self.all(named_children(node)) + 1,
            "array_creation_expression" => {
                let dimensions: Vec<Node> = children(node).into_iter().filter(|part| part.kind() == "dimensions_expr").collect();
                let primitive = field("type").is_some_and(|kind| kind.kind() == "integral_type" || kind.kind() == "floating_point_type" || kind.kind() == "boolean_type");
                let create = if dimensions.len() > 1 { 4 } else if primitive { 2 } else { 3 };
                let sizes: usize = dimensions.iter().filter_map(|dimension| dimension.named_child(0)).map(|dimension| self.value(dimension)).sum();
                sizes + create + field("value").map_or(0, |values| self.initializer(values))
            }
            "array_initializer" => 3 + self.initializer(node),
            "lambda_expression" | "method_reference" => 5 + usize::from(text.starts_with("this")),
            "switch_expression" => LARGE,
            _ => 2,
        }
    }

    /// Whether javac folds an expression to one constant: literals and constant fields joined by operators.
    fn constant(&self, node: Node<'t>) -> bool {
        match node.kind() {
            kind if kind.ends_with("literal") || matches!(kind, "true" | "false") => kind != "null_literal",
            "parenthesized_expression" | "binary_expression" | "unary_expression" | "ternary_expression" => named_children(node).into_iter().all(|part| self.constant(part)),
            "cast_expression" => node.child_by_field_name("value").is_some_and(|value| self.constant(value)) && node.child_by_field_name("type").and_then(|kind| self.context.resolver.type_node(kind)).is_some_and(|kind| matches!(kind, Type::Primitive(_)) || kind.name() == "java.lang.String"),
            "identifier" | "field_access" | "scoped_identifier" => self.context.resolver.constant_field(node),
            _ => false,
        }
    }

    fn initializer(&self, values: Node<'t>) -> usize {
        let items = named_children(values);
        let count = literal(&items.len().to_string(), "decimal_integer_literal");
        count + items.iter().enumerate().map(|(at, item)| 2 + literal(&at.to_string(), "decimal_integer_literal") + self.value(*item)).sum::<usize>()
    }

    /// Whether a `break` or `continue` jumps out of the measured `try`, which ends its range.
    fn leaves(&self, jump: Node) -> bool {
        let label = jump.named_child(0).map(|label| self.context.text(label));
        let mut around = crate::engine::source::parent(jump);
        while let Some(node) = around {
            if node.id() == self.tried.id() {
                return true;
            }
            let target = match label {
                Some(label) => node.kind() == "labeled_statement" && node.named_child(0).is_some_and(|name| self.context.text(name) == label),
                None => LOOPS.contains(&node.kind()) || (jump.kind() == "break_statement" && node.kind() == "switch_statement"),
            };
            if target || matches!(node.kind(), "lambda_expression" | "class_body") {
                return false;
            }
            around = crate::engine::source::parent(node);
        }
        false
    }

    pub(super) fn add(&mut self, bytes: usize) {
        self.total += bytes;
    }

    /// Ends the range at a jump out of the `try`; the code after it starts the next one.
    fn split(&mut self, at: usize) {
        if self.total > 0 {
            self.entries.push((self.total, at));
        }
        self.total = 0;
    }

    pub(super) fn statement(&mut self, node: Node<'t>) {
        let field = |name: &str| node.child_by_field_name(name);
        match node.kind() {
            "block" | "labeled_statement" | "constructor_body" => children(node).into_iter().filter(|part| part.is_named()).for_each(|part| self.statement(part)),
            "local_variable_declaration" => {
                for declarator in crate::java::helpers::declarators(node) {
                    let Some(value) = declarator.child_by_field_name("value") else { continue };
                    let slot = self.slots.slot(declarator).unwrap_or(4);
                    let bytes = if value.kind() == "array_initializer" { self.expression(value) } else { self.value(value) };
                    self.add(bytes + Size::slot_bytes(slot));
                }
            }
            "expression_statement" => {
                let Some(inner) = node.named_child(0) else { return };
                let bytes = match inner.kind() {
                    "assignment_expression" => self.assignment(inner, false),
                    "update_expression" => self.update(inner, false),
                    "explicit_constructor_invocation" => self.expression(inner),
                    _ => {
                        let kind = self.kind(inner);
                        let dropped = usize::from(!matches!(kind, Some(Type::Primitive("void"))));
                        let cast = inner.kind() == "method_invocation" && self.cast(inner);
                        self.expression(inner) + dropped - 3 * usize::from(cast)
                    }
                };
                self.add(bytes);
            }
            "return_statement" => {
                let kept = if self.finally || self.closes > 0 { Size::slot_bytes(self.slots.slot(node).unwrap_or(4)) } else { 0 };
                let bytes = node.named_child(0).map_or(0, |value| self.value(value) + kept);
                self.add(bytes + self.closes);
                self.split(node.end_byte());
            }
            "throw_statement" => {
                let bytes = node.named_child(0).map_or(0, |value| self.value(value)) + 1;
                self.add(bytes);
            }
            "if_statement" => {
                let bytes = field("condition").map_or(0, |condition| self.condition(condition));
                self.add(bytes);
                if let Some(then) = field("consequence") {
                    self.statement(then);
                }
                if let Some(other) = field("alternative") {
                    self.add(3);
                    self.statement(other);
                }
            }
            "while_statement" | "for_statement" | "do_statement" => {
                for part in children(node).into_iter().filter(|part| part.kind() == "local_variable_declaration") {
                    self.statement(part);
                }
                for init in node.children_by_field_name("init", &mut node.walk()).filter(|part| part.kind() != "local_variable_declaration") {
                    let bytes = self.expression(init) + usize::from(!matches!(init.kind(), "assignment_expression" | "update_expression"));
                    self.add(bytes);
                }
                let bytes = field("condition").map_or(0, |condition| self.condition(condition));
                self.add(bytes);
                if let Some(body) = field("body") {
                    self.statement(body);
                }
                let updates: usize = node.children_by_field_name("update", &mut node.walk()).map(|update| match update.kind() {
                    "update_expression" => self.update(update, false),
                    "assignment_expression" => self.assignment(update, false),
                    _ => self.expression(update),
                }).sum();
                self.add(updates + if node.kind() == "do_statement" { 0 } else { 3 });
            }
            "enhanced_for_statement" => {
                let array = field("value").and_then(|value| self.kind(value)).is_some_and(|kind| matches!(kind, Type::Array(_)));
                let bytes = field("value").map_or(0, |value| self.value(value)) + if array { 22 } else { 28 };
                self.add(bytes);
                if let Some(body) = field("body") {
                    self.statement(body);
                }
                self.add(if array { 6 } else { 3 });
            }
            "try_statement" => {
                if let Some(body) = field("body") {
                    self.statement(body);
                }
                self.try_clauses(node);
            }
            "synchronized_statement" => {
                let bytes = node.named_child(0).map_or(0, |lock| self.value(lock)) + 4;
                self.add(bytes);
                if let Some(body) = field("body") {
                    self.statement(body);
                }
                self.add(13);
            }
            "yield_statement" => self.add(3 + node.named_child(0).map_or(0, |value| self.value(value))),
            "break_statement" | "continue_statement" if self.leaves(node) => self.split(node.end_byte()),
            "break_statement" | "continue_statement" => self.add(3),
            "try_with_resources_statement" => {
                if let Some(body) = field("body") {
                    self.guarded(&super::resources::of(node), body);
                }
                self.try_clauses(node);
            }
            "switch_expression" | "switch_statement" | "assert_statement" => self.add(LARGE),
            _ => {}
        }
    }
}

/// The ranges of the exception table that cover the code of the `try`, in order: the bytes of each and the part of
/// the source it stands for. A `return`, or a jump out of the `try`, ends one; the code that closes the resources of
/// a try-with-resources before it is part of the range.
pub fn ranges(context: &Context, tried: Node) -> Vec<(usize, usize, usize)> {
    let root = crate::engine::source::ancestor(tried, &["class_body"]).unwrap_or(tried);
    let resources = super::resources::of(tried);
    let mut size = Size { context, slots: Slots::of(context, tried), scopes: Scopes::of(context.file, root), tried, finally: false, closes: 0, total: 0, entries: Vec::new() };
    size.finally = children(tried).iter().any(|part| part.kind() == "finally_clause");
    if let Some(body) = tried.child_by_field_name("body") {
        size.guarded(&resources, body);
    }
    let end = tried.child_by_field_name("body").map_or(tried.end_byte(), |body| body.end_byte());
    size.split(end);
    let mut start = tried.start_byte();
    size.entries.into_iter().map(|(bytes, at)| {
        let range = (bytes, start, at);
        start = at;
        range
    }).collect()
}
