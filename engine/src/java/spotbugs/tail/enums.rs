//! MutableEnum rebuilt from what SpotBugs 4.9.8 reports on test code, for a public enum (or one inside an interface):
//! - ME_MUTABLE_ENUM_FIELD: each public instance field that is not final, written or not; priority 2, no line.
//! A protected enum nested in a class counts as public (javac marks its class file public).
//! - ME_ENUM_FIELD_SETTER: a public method (static ones too) that stores the value of one of its parameters (through casts
//!   and locals copied from it, while nothing writes them again) into an instance field of the enum, of `this` or
//!   of another constant, before any jump in its code: a condition, loop, `switch`, conditional value, `&&`,
//!   `||`, `!`, comparison, `assert`, or the end of a `try`, `catch` or `synchronized` block. Calls do not count.
//!   `if` and `do` conditions javac folds, and empty `try` blocks, write no jump. Chained `f = g = p` sets both.
//!   A nested enum's public fields are left out. Once per method and field, at the first such store; priority 2.
//!   Known gap: a `switch` is taken as a jump, while SpotBugs reports a store after or inside one.
use super::super::taint::lines;
use super::super::{Context, fields, folds, names, place};
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::has_modifier;
use crate::java::types::expr::{Binding, unwrap};
use std::collections::{HashMap, HashSet};
use tree_sitter::Node;

pub const SETTER: &str = "ME_ENUM_FIELD_SETTER";
pub const MUTABLE: &str = "ME_MUTABLE_ENUM_FIELD";

fn public_enum(class: Node) -> bool {
    if class.kind() != "enum_declaration" {
        return false;
    }
    let in_interface = parent(class).and_then(parent).is_some_and(|outer| matches!(outer.kind(), "interface_declaration" | "annotation_type_declaration"));
    has_modifier(class, "public") || in_interface || (has_modifier(class, "protected") && nested(class))
}

fn nested(class: Node) -> bool {
    parent(class).is_some_and(|body| matches!(body.kind(), "class_body" | "interface_body" | "enum_body_declarations"))
}

fn members(class: Node) -> Vec<Node> {
    let Some(body) = class.child_by_field_name("body") else { return Vec::new() };
    children(body).into_iter().filter(|part| part.kind() == "enum_body_declarations").flat_map(named_children).collect()
}

fn mutable_fields(context: &Context, binary: &str, class: Node) {
    for field in members(class).into_iter().filter(|member| member.kind() == "field_declaration") {
        if !has_modifier(field, "public") || has_modifier(field, "static") || has_modifier(field, "final") {
            continue;
        }
        for declarator in named_children(field).into_iter().filter(|part| part.kind() == "variable_declarator") {
            let Some(name) = declarator.child_by_field_name("name").map(|name| context.text(name)) else { continue };
            let qualified = format!("{binary}.{name}");
            context.report_listed(MUTABLE, declarator, 0, format!("{qualified} field is public and mutable"), format!("member:{qualified}"), 2, vec![qualified]);
        }
    }
}

/// Whether an expression makes javac write a jump; lambdas and classes inside are code of their own.
fn jumps(context: &Context, node: Node) -> bool {
    let operator = |part: Node| part.child_by_field_name("operator").map(|operator| context.text(operator)).unwrap_or_default();
    let here = match node.kind() {
        "lambda_expression" | "class_body" => return false,
        "ternary_expression" | "switch_expression" => true,
        "unary_expression" => operator(node) == "!",
        "binary_expression" => matches!(operator(node), "&&" | "||" | "==" | "!=" | "<" | "<=" | ">" | ">="),
        "instanceof_expression" => named_children(node).len() > 2,
        _ => false,
    };
    here || children(node).into_iter().any(|part| jumps(context, part))
}

struct Setter<'s, 'a> {
    context: &'s Context<'a>,
    own: String,
    /// The locals and parameters that hold a parameter's value as given.
    given: HashMap<String, bool>,
    seen: HashSet<String>,
    label: String,
    /// A nested enum: SpotBugs leaves out the setters of its public fields.
    nested: bool,
    public_fields: HashSet<String>,
}

impl<'a> Setter<'_, 'a> {
    fn holds_parameter(&self, value: Node) -> bool {
        let mut value = unwrap(value);
        loop {
            let inner = match value.kind() {
                "cast_expression" => value.child_by_field_name("value"),
                "assignment_expression" if value.child_by_field_name("operator").is_some_and(|operator| self.context.text(operator) == "=") => value.child_by_field_name("right"),
                _ => break,
            };
            let Some(inner) = inner else { return false };
            value = unwrap(inner);
        }
        let local = !matches!(self.context.resolver.binding(value, self.context.text(value)), Some(Binding::Field(..)));
        value.kind() == "identifier" && local && self.given.get(self.context.text(value)).copied().unwrap_or(false)
    }

    /// The value javac folds a condition to, also through a `final` local set from `true` or `false`.
    fn fixed(&self, condition: Option<Node>) -> Option<bool> {
        let named = condition.map(unwrap).filter(|condition| condition.kind() == "identifier");
        let local = named.and_then(|name| super::super::dumb::numbers::values::local_value(self.context, name));
        let constant = local.filter(|value| crate::engine::source::ancestor(*value, &["local_variable_declaration"]).is_some_and(|declaration| has_modifier(declaration, "final")));
        match constant.map(|value| value.kind()) {
            Some("true") => Some(true),
            Some("false") => Some(false),
            _ => folds::fixed(self.context, condition),
        }
    }

    fn store(&mut self, assignment: Node<'a>) {
        let (Some(left), Some(right)) = (assignment.child_by_field_name("left"), assignment.child_by_field_name("right")) else { return };
        let plain = assignment.child_by_field_name("operator").is_some_and(|operator| self.context.text(operator) == "=");
        let left = unwrap(left);
        if left.kind() == "identifier" && matches!(self.context.resolver.binding(left, self.context.text(left)), Some(Binding::Local(_))) {
            let holds = plain && self.holds_parameter(right);
            self.given.insert(self.context.text(left).to_string(), holds);
            return;
        }
        let Some((class, name)) = fields::field_key(self.context, left) else { return };
        let instance = self.context.resolver.index.get(&class).and_then(|info| info.fields.iter().find(|field| field.name == name)).is_some_and(|field| field.flags & crate::java::types::model::flag::STATIC == 0);
        let shown_field = self.nested && self.public_fields.contains(&name);
        if !plain || class != self.own || !instance || shown_field || !self.holds_parameter(right) || !self.seen.insert(name.clone()) {
            return;
        }
        let context = self.context;
        let label = &self.label;
        let message = format!("{label} unconditionally sets the field {name}");
        let shown = place::member(context, &class, &name);
        context.report_listed(SETTER, assignment, lines::after(context, assignment), message, shown, 2, vec![label.clone(), name]);
    }

    /// Goes through the statements in order; false once javac would have written a jump.
    fn statements(&mut self, block: Node<'a>) -> bool {
        for statement in named_children(block) {
            if !self.statement(statement) {
                return false;
            }
        }
        true
    }

    fn statement(&mut self, statement: Node<'a>) -> bool {
        match statement.kind() {
            "line_comment" | "block_comment" | "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" => true,
            "block" => self.statements(statement),
            "labeled_statement" => named_children(statement).into_iter().filter(|part| part.kind() != "identifier").all(|part| self.statement(part)),
            "if_statement" => match self.fixed(statement.child_by_field_name("condition")) {
                Some(true) => statement.child_by_field_name("consequence").is_none_or(|taken| self.statement(taken)),
                Some(false) => statement.child_by_field_name("alternative").is_none_or(|taken| self.statement(taken)),
                None => false,
            },
            "do_statement" if folds::fixed(self.context, statement.child_by_field_name("condition")) == Some(false) => statement.child_by_field_name("body").is_none_or(|body| self.statement(body)),
            "try_statement" if empty(statement.child_by_field_name("body")) && children(statement).into_iter().filter(|part| part.kind() == "finally_clause").all(|clause| empty(named_children(clause).into_iter().find(|part| part.kind() == "block"))) => true,
            "synchronized_statement" | "try_statement" => {
                let body = statement.child_by_field_name("body");
                let lock = statement.kind() == "synchronized_statement" && named_children(statement).first().is_some_and(|lock| jumps(self.context, *lock));
                if !lock && let Some(body) = body {
                    self.statements(body);
                }
                false
            }
            "local_variable_declaration" => {
                if jumps(self.context, statement) {
                    return false;
                }
                for declarator in named_children(statement).into_iter().filter(|part| part.kind() == "variable_declarator") {
                    let Some(name) = declarator.child_by_field_name("name").map(|name| self.context.text(name).to_string()) else { continue };
                    let holds = declarator.child_by_field_name("value").is_some_and(|value| self.holds_parameter(value));
                    self.given.insert(name, holds);
                }
                true
            }
            "expression_statement" => {
                if jumps(self.context, statement) {
                    return false;
                }
                let mut stores = Vec::new();
                stores_in(statement, &mut stores);
                stores.sort_by_key(|store| (store.end_byte(), std::cmp::Reverse(store.start_byte())));
                for store in stores {
                    if store.kind() == "assignment_expression" {
                        self.store(store);
                    } else if let Some(local) = named_children(store).into_iter().find(|part| part.kind() == "identifier") {
                        self.given.insert(self.context.text(local).to_string(), false);
                    }
                }
                true
            }
            _ => false,
        }
    }
}

/// A block with no code in it.
fn empty(block: Option<Node>) -> bool {
    block.is_some_and(|block| named_children(block).iter().all(|part| part.kind().ends_with("comment")))
}

/// The assignments and updates of an expression, not those of lambdas and classes inside it.
fn stores_in<'a>(node: Node<'a>, out: &mut Vec<Node<'a>>) {
    for part in children(node) {
        if matches!(part.kind(), "lambda_expression" | "class_body") {
            continue;
        }
        if matches!(part.kind(), "assignment_expression" | "update_expression") {
            out.push(part);
        }
        stores_in(part, out);
    }
}

fn parameters(context: &Context, method: Node) -> HashMap<String, bool> {
    let mut given = HashMap::new();
    for parameter in method.child_by_field_name("parameters").map(named_children).unwrap_or_default() {
        let name = parameter.child_by_field_name("name").or_else(|| named_children(parameter).into_iter().rev().find(|part| part.kind() == "variable_declarator").and_then(|declarator| declarator.child_by_field_name("name")));
        if let Some(name) = name {
            given.insert(context.text(name).to_string(), true);
        }
    }
    given
}

pub fn check<'a>(context: &Context<'a>, own: &str, class: Node<'a>) {
    if !context.wants(&[SETTER, MUTABLE]) || !public_enum(class) {
        return;
    }
    let binary = names::binary(context, own);
    if context.wants(&[MUTABLE]) {
        mutable_fields(context, &binary, class);
    }
    if !context.wants(&[SETTER]) {
        return;
    }
    let public_fields: HashSet<String> = members(class)
        .into_iter()
        .filter(|member| member.kind() == "field_declaration" && has_modifier(*member, "public"))
        .flat_map(|field| named_children(field).into_iter().filter(|part| part.kind() == "variable_declarator").filter_map(|declarator| declarator.child_by_field_name("name")).map(|name| context.text(name).to_string()).collect::<Vec<_>>())
        .collect();
    for method in members(class).into_iter().filter(|member| member.kind() == "method_declaration") {
        if !has_modifier(method, "public") {
            continue;
        }
        let Some(body) = method.child_by_field_name("body") else { continue };
        let Some(label) = super::super::statements::member_label(context, own, class, method) else { continue };
        let mut setter = Setter { context, own: own.to_string(), given: parameters(context, method), seen: HashSet::new(), label, nested: nested(class), public_fields: public_fields.clone() };
        setter.statements(body);
    }
}
