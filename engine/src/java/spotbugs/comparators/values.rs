//! What a compare method's code shows SpotBugs about its values: which come from instance fields or constants,
//! which return `Integer.MIN_VALUE`, and which `if_icmp` branches show a value nonzero.
use super::minimum::Walk;
use super::operands::{negate, primitive};
use crate::engine::source::children;
use crate::java::types::constant::Constant;
use crate::java::types::expr::unwrap;
use tree_sitter::Node;

impl<'t> Walk<'_, '_, 't> {
    /// A value SpotBugs knows came from an instance field: a field read, a local only ever given one, arithmetic on
    /// one or its unboxing.
    pub(super) fn from_field(&self, node: Node, depth: usize) -> bool {
        let node = unwrap(node);
        if depth > 8 {
            return false;
        }
        match node.kind() {
            "identifier" | "field_access" => {
                let field = super::super::fields::field_key(self.context, node);
                if let Some((declaring, name)) = field {
                    let statik = self.context.resolver.index.field(&declaring, &name).is_some_and(|(_, field)| field.flags & crate::java::types::model::flag::STATIC != 0);
                    return !statik;
                }
                node.kind() == "identifier" && self.written_once(self.context.text(node)).is_some_and(|value| self.from_field(value, depth + 1))
            }
            "binary_expression" => ["left", "right"].iter().any(|side| node.child_by_field_name(side).is_some_and(|side| self.from_field(side, depth + 1))),
            "unary_expression" | "cast_expression" => {
                let inner = node.child_by_field_name("operand").or_else(|| node.child_by_field_name("value"));
                inner.is_some_and(|inner| self.from_field(inner, depth + 1))
            }
            "method_invocation" => {
                let unboxing = node.child_by_field_name("name").is_some_and(|name| self.context.text(name) == "intValue");
                unboxing && node.child_by_field_name("object").is_some_and(|object| self.from_field(object, depth + 1))
            }
            _ => false,
        }
    }

    /// The constant a local was declared with, when nothing else is ever stored into it.
    fn local_constant(&self, node: Node) -> Option<Node<'t>> {
        let node = unwrap(node);
        let value = self.written_once(self.context.text(node)).filter(|_| node.kind() == "identifier")?;
        self.context.resolver.constant_number(unwrap(value)).map(|_| unwrap(value))
    }

    fn written_once(&self, name: &str) -> Option<Node<'t>> {
        let mut nodes = Vec::new();
        super::floating::own_nodes(self.body, &mut nodes);
        let named = |node: Option<Node>| node.map(unwrap).is_some_and(|node| node.kind() == "identifier" && self.context.text(node) == name);
        let mut found = None;
        for node in nodes {
            match node.kind() {
                "variable_declarator" if named(node.child_by_field_name("name")) => {
                    if found.is_some() {
                        return None;
                    }
                    found = Some(node.child_by_field_name("value")?);
                }
                "assignment_expression" if named(node.child_by_field_name("left")) => return None,
                "update_expression" if children(node).into_iter().any(|part| named(Some(part))) => return None,
                _ => {}
            }
        }
        found
    }

    /// `Integer.MIN_VALUE` as javac writes it: a constant expression, or a `static final` field of the file given one.
    fn is_minimum(&self, value: Node) -> bool {
        let value = unwrap(value);
        if self.context.resolver.constant_number(value) == Some(Constant::Int(i32::MIN)) {
            return true;
        }
        let Some((declaring, name)) = super::super::fields::field_key(self.context, value) else { return false };
        let Some(class) = self.context.classes.get(&declaring) else { return false };
        let Some(body) = class.child_by_field_name("body") else { return false };
        super::super::place::members(body).into_iter().filter(|member| matches!(member.kind(), "field_declaration" | "constant_declaration")).any(|member| {
            let fixed = crate::java::helpers::has_modifier(member, "final") || member.kind() == "constant_declaration";
            fixed && crate::java::helpers::declarators(member).into_iter().any(|declarator| {
                let named = declarator.child_by_field_name("name").is_some_and(|written| self.context.text(written) == name);
                named && declarator.child_by_field_name("value").is_some_and(|initial| self.context.resolver.constant_number(unwrap(initial)) == Some(Constant::Int(i32::MIN)))
            })
        })
    }

    pub(super) fn minimum(&self, value: Node) -> bool {
        let value = unwrap(value);
        if self.is_minimum(value) {
            return true;
        }
        value.kind() == "identifier" && self.constant_local(self.context.text(value))
    }

    /// A local declared with the constant and never written again.
    fn constant_local(&self, name: &str) -> bool {
        let mut nodes = Vec::new();
        super::floating::own_nodes(self.body, &mut nodes);
        let named = |node: Option<Node>| node.map(unwrap).is_some_and(|node| node.kind() == "identifier" && self.context.text(node) == name);
        let mut declared = false;
        for node in nodes {
            match node.kind() {
                "variable_declarator" if named(node.child_by_field_name("name")) => {
                    let value = node.child_by_field_name("value");
                    if declared || !value.is_some_and(|value| self.is_minimum(value)) {
                        return false;
                    }
                    declared = true;
                }
                "assignment_expression" if named(node.child_by_field_name("left")) => return false,
                "update_expression" if children(node).into_iter().any(|part| named(Some(part))) => return false,
                _ => {}
            }
        }
        declared
    }

    /// For an `if_icmp` comparison: whether it shows a value nonzero when it holds, and when it fails.
    pub(super) fn nonzero(&self, node: Node, operator: &str) -> Option<(bool, bool)> {
        let resolver = self.context.resolver;
        let [left, right] = ["left", "right"].map(|side| node.child_by_field_name(side).map(unwrap));
        let (left, right) = (left?, right?);
        let int = |side: Node| resolver.type_of(side).is_some_and(|kind| primitive(&kind) == "int");
        if !(int(left) && int(right)) {
            return None;
        }
        let literal = |side: Node| match resolver.constant_number(side) {
            Some(Constant::Int(value)) => Some(i64::from(value)),
            Some(Constant::Char(value)) => Some(i64::from(value)),
            _ => None,
        };
        let value = |side: Node| literal(side).or_else(|| self.local_constant(side).and_then(literal));
        let (left_value, right_value) = (value(left), value(right));
        if !(left_value.is_some() || self.from_field(left, 0)) || !(right_value.is_some() || self.from_field(right, 0)) || literal(right) == Some(0) {
            return None;
        }
        if let (Some(left_value), Some(right_value)) = (left_value, right_value) {
            let holds = compare(operator, left_value, right_value);
            return Some((!holds, holds));
        }
        let shows = |operator: &str| -> bool {
            match (left_value, right_value) {
                (None, Some(constant)) => known(operator, constant),
                (Some(constant), None) => known(mirror(operator), constant),
                _ => matches!(operator, "!=" | "<" | ">"),
            }
        };
        Some((shows(operator), shows(negate(operator)?)))
    }
}

/// The fixed result of comparing two locals that each only ever hold a constant.
fn compare(operator: &str, left: i64, right: i64) -> bool {
    match operator {
        "==" => left == right,
        "!=" => left != right,
        ">" => left > right,
        ">=" => left >= right,
        "<" => left < right,
        _ => left <= right,
    }
}

/// Whether `x OP c` shows `x` nonzero.
fn known(operator: &str, constant: i64) -> bool {
    match operator {
        "==" => constant != 0,
        "!=" => constant == 0,
        ">" => constant >= 0,
        ">=" => constant > 0,
        "<" => constant <= 0,
        "<=" => constant < 0,
        _ => false,
    }
}

fn mirror(operator: &str) -> &str {
    match operator {
        "<" => ">",
        "<=" => ">=",
        ">" => "<",
        ">=" => "<=",
        other => other,
    }
}
