//! How many bytes of code javac compiles for a part of a `try`: the length of a range of the exception table that a
//! `catch` of the `try` covers. Worked out from the source, instruction by instruction as javac writes them (short
//! forms for small constants and the first four local slots, `iinc`, `invokeinterface`, boxing calls, `checkcast`
//! after a generic call whose result is used); `switch` and `assert` count as large.
use super::super::Context;
use super::slots::Slots;
use crate::engine::source::named_children;
use crate::java::javac::locals::{Found, Scopes, declaration};
use crate::java::types::model::Type;
use tree_sitter::Node;

pub(super) const COMPARISONS: &[&str] = &["==", "!=", "<", ">", "<=", ">="];
const BOXES: &[&str] = &["java.lang.Integer", "java.lang.Long", "java.lang.Short", "java.lang.Byte", "java.lang.Character", "java.lang.Boolean", "java.lang.Float", "java.lang.Double"];

pub struct Size<'c, 'a, 't> {
    pub context: &'c Context<'a>,
    pub slots: Slots,
    pub scopes: Scopes<'t>,
    /// The `try` has a `finally`: a returned value is stored before the code of the `finally`.
    pub finally: bool,
    /// The bytes that close the resources of a try-with-resources before a `return`.
    pub closes: usize,
    pub tried: Node<'t>,
    pub total: usize,
    /// The ranges ended so far: their bytes and where in the source each ends.
    pub entries: Vec<(usize, usize)>,
}

pub(super) fn literal(text: &str, kind: &str) -> usize {
    let clean: String = text.chars().filter(|letter| *letter != '_').collect();
    let long = clean.ends_with(['l', 'L']);
    let digits = clean.trim_end_matches(['l', 'L']);
    let value = match kind {
        "hex_integer_literal" => i64::from_str_radix(&digits[2..], 16).ok(),
        "binary_integer_literal" => i64::from_str_radix(&digits[2..], 2).ok(),
        "octal_integer_literal" => i64::from_str_radix(digits.trim_start_matches('0'), 8).ok().or(Some(0)),
        _ => digits.parse().ok(),
    };
    match (long, value) {
        (true, Some(0 | 1)) => 1,
        (true, _) => 3,
        (false, Some(-1..=5)) => 1,
        (false, Some(-128..=127)) => 2,
        (false, Some(-32768..=32767)) => 3,
        _ => 2,
    }
}

impl<'t> Size<'_, '_, 't> {
    pub(super) fn kind(&self, node: Node) -> Option<Type> {
        self.context.resolver.type_of(node)
    }

    pub(super) fn boxed(&self, node: Node) -> bool {
        self.kind(node).is_some_and(|kind| matches!(kind, Type::Class(ref name, _) if BOXES.contains(&name.as_str())))
    }

    pub(super) fn wide(&self, node: Node) -> bool {
        matches!(self.kind(node), Some(Type::Primitive("long" | "double")))
    }

    pub(super) fn local(&self, node: Node<'t>) -> Option<usize> {
        let name = self.context.text(node);
        match declaration(self.context.resolver, &self.scopes, node, name)? {
            Found::Local(declared) => Some(self.slots.slot(declared).unwrap_or(4)),
            Found::Field => None,
        }
    }

    pub(super) fn slot_bytes(slot: usize) -> usize {
        if slot <= 3 { 1 } else { 2 }
    }

    /// A value with the boxing or unboxing its place asks for.
    pub fn value(&self, node: Node<'t>) -> usize {
        let own = self.expression(node);
        let Some(kind) = self.kind(node) else { return own };
        let converted = match (kind, self.context.resolver.expected(node)) {
            (Type::Primitive(name), Some(Type::Class(..) | Type::Variable(_))) => name != "void",
            (Type::Class(name, _), Some(Type::Primitive(_))) => BOXES.contains(&name.as_str()),
            _ => false,
        };
        own + 3 * usize::from(converted)
    }

    pub(super) fn all(&self, nodes: impl IntoIterator<Item = Node<'t>>) -> usize {
        nodes.into_iter().map(|node| self.value(node)).sum()
    }

    pub(super) fn arguments(&self, node: Node<'t>) -> usize {
        node.child_by_field_name("arguments").map_or(0, |list| self.all(named_children(list)))
    }

    pub(super) fn call(&self, node: Node<'t>) -> usize {
        let resolved = self.context.resolver.resolve_call(node);
        let object = node.child_by_field_name("object");
        let is_static = resolved.as_ref().is_some_and(|call| call.method.is_static);
        let receiver = match object {
            Some(object) if matches!(object.kind(), "super" | "this") => 1,
            Some(_) if is_static => 0,
            Some(object) => self.value(object),
            None => usize::from(!is_static),
        };
        let owner = match object {
            Some(object) if !matches!(object.kind(), "super" | "this") => self.kind(object).map(|kind| kind.erased().name()),
            _ => resolved.as_ref().map(|call| call.declaring.clone()),
        };
        let interface = !is_static && owner.is_some_and(|owner| self.context.resolver.index.get(&owner).is_some_and(|info| info.is_interface));
        let cast = self.cast(node);
        let packed = resolved.as_ref().filter(|call| call.method.varargs).map_or(0, |call| self.spread(node, &call.method.parameters));
        receiver + self.arguments(node) + if interface { 5 } else { 3 } + 3 * usize::from(cast) + packed
    }

    /// Whether javac casts the result of a generic call to the type it stands for; not when the result is dropped.
    pub(super) fn cast(&self, node: Node<'t>) -> bool {
        self.context.resolver.resolve_call(node).is_some_and(|call| {
            matches!(call.method.generic_returns, Type::Variable(_)) && self.kind(node).is_some_and(|kind| kind.erased() != call.method.returns && kind.erased().name() != "java.lang.Object")
        })
    }

    /// The bytes javac adds to pack the trailing arguments of a varargs call into a new array.
    pub(super) fn spread(&self, node: Node, formals: &[Type]) -> usize {
        let given = node.child_by_field_name("arguments").map_or(0, |list| list.named_child_count());
        let last = node.child_by_field_name("arguments").and_then(|list| list.named_child(u32::try_from(formals.len().saturating_sub(1)).unwrap_or(0)));
        if given == formals.len() && last.and_then(|last| self.kind(last)).is_none_or(|kind| matches!(kind, Type::Array(_) | Type::Null)) {
            return 0;
        }
        let packed = given + 1 - formals.len().min(given + 1);
        let create = if matches!(formals.last(), Some(Type::Array(element)) if matches!(**element, Type::Primitive(_))) { 2 } else { 3 };
        literal(&packed.to_string(), "decimal_integer_literal") + create + (0..packed).map(|at| 2 + literal(&at.to_string(), "decimal_integer_literal")).sum::<usize>()
    }

    pub(super) fn name(&self, node: Node<'t>) -> usize {
        if self.context.resolver.constant_field(node) {
            return 2 + usize::from(self.wide(node));
        }
        match self.local(node) {
            Some(slot) => Self::slot_bytes(slot),
            None => {
                let is_static = matches!(self.context.resolver.binding(node, self.context.text(node)), Some(crate::java::types::expr::Binding::Field(_, _, field)) if field.flags & crate::java::types::model::flag::STATIC != 0);
                if is_static { 3 } else { 4 }
            }
        }
    }

    pub(super) fn store(&self, target: Node<'t>, value: usize) -> usize {
        match target.kind() {
            "identifier" => match self.local(target) {
                Some(slot) => value + Self::slot_bytes(slot),
                None => value + self.name(target),
            },
            "field_access" => target.child_by_field_name("object").map_or(0, |object| self.value(object)) + value + 3,
            "array_access" => self.all(named_children(target)) + value + 1,
            _ => value + 2,
        }
    }

    pub(super) fn assignment(&self, node: Node<'t>, kept: bool) -> usize {
        let (Some(target), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return 0 };
        let operator = node.child_by_field_name("operator").map_or("=", |operator| self.context.text(operator));
        let local = target.kind() == "identifier" && self.local(target).is_some();
        let small = right.kind() == "decimal_integer_literal" && literal(self.context.text(right), right.kind()) <= 2;
        if local && matches!(operator, "+=" | "-=") && small && matches!(self.kind(target), Some(Type::Primitive("int"))) {
            return 3 + usize::from(kept) * Self::slot_bytes(self.local(target).unwrap_or(4));
        }
        let text = self.kind(target).is_some_and(|kind| kind.name() == "java.lang.String");
        let value = match operator {
            "=" => self.value(right),
            _ if text => self.expression(target) + self.value(right) + 5,
            _ => self.expression(target) + self.value(right) + 1,
        };
        self.store(target, value) + usize::from(kept)
    }

    pub(super) fn update(&self, node: Node<'t>, kept: bool) -> usize {
        let Some(target) = node.named_child(0) else { return 0 };
        if target.kind() == "identifier" && self.local(target).is_some() && matches!(self.kind(target), Some(Type::Primitive("int" | "short" | "byte" | "char"))) {
            return 3 + usize::from(kept) * Self::slot_bytes(self.local(target).unwrap_or(4));
        }
        self.store(target, self.expression(target) + 2) + usize::from(kept) + 2
    }

    /// The bytes that jump on a condition.
    pub fn condition(&self, node: Node<'t>) -> usize {
        let node = crate::java::types::expr::unwrap(node);
        match node.kind() {
            "binary_expression" => {
                let operator = node.child_by_field_name("operator").map_or("", |operator| self.context.text(operator));
                let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return 3 };
                if matches!(operator, "&&" | "||") {
                    return self.condition(left) + self.condition(right);
                }
                if !COMPARISONS.contains(&operator) {
                    return self.value(node) + 3;
                }
                let zero = |side: Node| matches!(side.kind(), "null_literal") || (side.kind() == "decimal_integer_literal" && self.context.text(side) == "0");
                let compare = usize::from(self.wide(left) || self.wide(right) || matches!(self.kind(left), Some(Type::Primitive("float" | "double"))));
                let sides = if zero(right) && compare == 0 { self.value(left) } else if zero(left) && compare == 0 { self.value(right) } else { self.operand(left) + self.operand(right) };
                sides + compare + 3
            }
            "unary_expression" if node.child_by_field_name("operator").is_some_and(|operator| self.context.text(operator) == "!") => {
                node.child_by_field_name("operand").map_or(3, |operand| self.condition(operand))
            }
            "true" | "false" => 3 * usize::from(self.context.text(node) == "false"),
            _ => self.value(node) + 3,
        }
    }

    pub(super) fn operand(&self, node: Node<'t>) -> usize {
        self.expression(node) + 3 * usize::from(self.boxed(node))
    }

    pub(super) fn concatenation(&self, node: Node<'t>) -> usize {
        let mut parts = Vec::new();
        let mut stack = vec![node];
        while let Some(part) = stack.pop() {
            let part = crate::java::types::expr::unwrap(part);
            let plus = part.kind() == "binary_expression" && part.child_by_field_name("operator").is_some_and(|operator| self.context.text(operator) == "+");
            if plus && self.kind(part).is_some_and(|kind| kind.name() == "java.lang.String") {
                stack.extend([part.child_by_field_name("right"), part.child_by_field_name("left")].into_iter().flatten());
            } else {
                parts.push(part);
            }
        }
        let constant = |part: &Node| part.kind().ends_with("literal") || self.context.resolver.constant_field(*part);
        if parts.iter().all(constant) {
            return 2;
        }
        parts.iter().filter(|part| !constant(part)).map(|part| self.expression(*part)).sum::<usize>() + 5
    }
}

/// The bytes javac writes from the end of a store into a field to the end of a later store: the store into the
/// local the first one's value goes to, the statements between (a statement, or a value with the bytes written
/// after it) and the second store (its object, its value and the store).
pub fn store_gap(context: &Context, local: Option<Node>, between: &[(Node, Option<usize>)], second: Node) -> usize {
    let root = crate::engine::source::ancestor(second, &["class_body"]).unwrap_or(second);
    let mut size = Size { context, slots: Slots::of(context, second), scopes: Scopes::of(context.file, root), tried: second, finally: false, closes: 0, total: 0, entries: Vec::new() };
    size.total += local.map_or(0, |local| Size::slot_bytes(size.slots.slot(local).unwrap_or(4)));
    for (part, after) in between {
        match after {
            Some(after) => size.total += size.value(*part) + after,
            None => size.statement(*part),
        }
    }
    size.total + size.assignment(second, false)
}
