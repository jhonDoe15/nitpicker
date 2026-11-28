//! Code javac writes that is a call although the source shows none: boxing and unboxing (`Integer.valueOf`,
//! `intValue`), and a `switch` on anything but an `int` (`ordinal`, `hashCode`, a pattern switch). And the
//! variables a pattern binds, which hold a value nothing else is known about. The calls FindSelfComparison looks at.
use super::Walk;
use super::values::{Mode, Seen, State, Val};
use crate::engine::source::{named_children, walk};
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::model::Type;
use tree_sitter::Node;

/// The calls whose object and only argument the comparisons look at.
const COMPARED: &[&str] = &["equals", "compareTo", "equalsIgnoreCase", "compareToIgnoreCase", "startsWith", "endsWith", "contains"];

fn boxed(kind: &Option<Type>) -> bool {
    matches!(kind, Some(Type::Class(..))) && kind.clone().is_some_and(|kind| matches!(kind.unboxed_or_same(), Type::Primitive(_)))
}

fn primitive(kind: &Option<Type>) -> bool {
    matches!(kind, Some(Type::Primitive(_)))
}

pub fn converts(from: &Option<Type>, to: &Option<Type>) -> bool {
    (boxed(from) && primitive(to)) || (primitive(from) && boxed(to))
}

impl<'c, 'a> Walk<'c, 'a> {
    pub fn type_of(&self, node: Node<'a>) -> Option<Type> {
        let node = unwrap(node);
        if node.kind() == "identifier" {
            if let Some(Binding::Local(kind)) = self.context.resolver.binding(node, self.context.text(node)) {
                return kind;
            }
        }
        self.context.resolver.type_of(node)
    }

    /// A value of `from` stored where `to` is wanted: a call when one is boxed and the other is not.
    pub fn convert(&mut self, from: Node<'a>, to: &Option<Type>) -> bool {
        let converted = converts(&self.type_of(from), to);
        if converted {
            self.converting();
        }
        converted
    }

    /// A primitive value converted to another primitive type: `Mode::Stack` keeps the variable it came from (not
    /// the field) when javac writes an instruction for it; else a new value when javac does.
    pub fn widen(&self, kept: Val, from: &str, to: &str) -> Val {
        let category = |name: &str| if matches!(name, "long" | "float" | "double") { name.to_string() } else { "int".to_string() };
        let emitted = category(from) != category(to) || (matches!(to, "byte" | "short" | "char") && from != to);
        match (emitted, self.mode, &kept) {
            (false, _, _) => kept,
            (true, Mode::Stack, Val::This | Val::Fresh(_) | Val::Converted(..)) => Val::Converted(Box::new(kept), to.to_string()),
            _ => self.numbers.fresh(),
        }
    }

    /// `widen` for a value stored where a primitive type is declared.
    pub fn widened(&self, kept: Val, value: Node<'a>, declared: &Option<Type>) -> Val {
        match (self.mode, self.type_of(value), declared) {
            (Mode::Stack | Mode::Numbers, Some(Type::Primitive(from)), Some(Type::Primitive(to))) => self.widen(kept, from, to),
            _ => kept,
        }
    }

    /// `Mode::Stack`: the two operands of a binary operator after binary numeric promotion.
    pub fn promoted(&self, node: Node<'a>, left: Val, right: Val) -> (Val, Val) {
        let kind = |name: &str| node.child_by_field_name(name).and_then(|part| self.type_of(part)).map(|kind| kind.unboxed_or_same());
        let (Some(Type::Primitive(one)), Some(Type::Primitive(two))) = (kind("left"), kind("right")) else { return (left, right) };
        if self.mode != Mode::Stack || one == "boolean" || two == "boolean" {
            return (left, right);
        }
        let target = ["double", "float", "long"].into_iter().find(|wide| one == *wide || two == *wide).unwrap_or("int");
        (self.widen(left, one, target), self.widen(right, two, target))
    }

    /// Whether javac unboxes an operand of this operator.
    pub fn unboxes(&self, node: Node<'a>) -> bool {
        let operator = node.child_by_field_name("operator").map(|operator| self.context.text(operator));
        let operands: Vec<Option<Type>> = ["left", "right", "operand"].iter().filter_map(|name| node.child_by_field_name(name)).map(|part| self.type_of(part)).collect();
        match operator {
            Some("==" | "!=") => operands.iter().any(boxed) && operands.iter().any(primitive),
            Some("+") if matches!(self.context.resolver.type_of(node), Some(Type::Class(name, _)) if name == "java.lang.String") => false,
            _ => operands.iter().any(boxed),
        }
    }

    /// Whether javac writes a call to pick the case of a `switch`.
    pub fn selects_by_call(&self, node: Node<'a>) -> bool {
        let Some(condition) = node.child_by_field_name("condition") else { return false };
        match self.type_of(condition) {
            Some(Type::Primitive(_)) => false,
            Some(_) => true,
            None => {
                let mut literal = false;
                walk(node.child_by_field_name("body").unwrap_or(node), |part| literal |= part.kind() == "string_literal" && part.parent().is_some_and(|label| label.kind() == "switch_label"));
                literal
            }
        }
    }

    /// The value of a condition javac knows while compiling: it writes only the branch taken.
    pub fn constant(&self, node: Option<Node<'a>>) -> Option<bool> {
        let node = unwrap(node?);
        match self.context.resolver.constant_number(node) {
            Some(crate::java::types::constant::Constant::Bool(value)) => Some(value),
            _ => match self.context.text(node) {
                "true" => Some(true),
                "false" => Some(false),
                _ => None,
            },
        }
    }

    /// The variables patterns in the node bind.
    pub fn bind(&mut self, node: Node<'a>, state: &mut State) {
        let mut names = Vec::new();
        walk(node, |part| {
            let name = match part.kind() {
                "instanceof_expression" => part.child_by_field_name("name"),
                "type_pattern" | "record_pattern_component" => named_children(part).into_iter().rfind(|piece| piece.kind() == "identifier"),
                _ => None,
            };
            names.extend(name);
        });
        for name in names {
            state.locals.insert(self.context.text(name).to_string(), self.numbers.fresh());
        }
    }

    /// A call: no value read from a field before is known to be what the field holds.
    pub fn called(&mut self) {
        self.calls = self.numbers.next();
        if self.mode != Mode::Stack {
            self.kills.push((self.calls, None));
        }
    }

    /// A call javac writes to box or unbox a value or to pick the case of a `switch` on a string: one with no
    /// effect for FindSelfComparison2.
    pub fn converting(&mut self) {
        if self.mode != Mode::Numbers {
            self.called();
        }
    }

    /// The calls in the code: FindSelfComparison2 keeps them, to judge with the whole run whether one has an effect.
    pub fn invoked(&mut self, calls: Vec<Node<'a>>) {
        match self.mode {
            Mode::Stack | Mode::Assign => self.called(),
            Mode::Numbers => {
                self.calls = self.numbers.next();
                self.kills.extend(calls.into_iter().map(|call| (self.calls, Some(call))));
            }
        }
    }

    /// `Mode::Stack`: where a load of a field runs.
    pub fn seen(&self, node: Node<'a>) -> Seen {
        Seen { line: super::super::super::nulls::redundant::line_before(self.context, node, node.start_byte()), calls: self.calls }
    }

    /// The calls that made a value read from a field out of date, when nothing else did.
    pub fn causes(&self, value: &Val) -> Option<Vec<Option<Node<'a>>>> {
        let Val::Load { field, epoch, .. } = value else { return None };
        let (calls, stores) = self.epoch(field);
        (epoch.1 == stores && epoch.0 != calls).then(|| self.kills.iter().filter(|(at, _)| *at > epoch.0 && *at <= calls).map(|(_, call)| *call).collect())
    }

    /// A call: its object, then its arguments. `Mode::Stack` keeps the variable through `valueOf` and `intValue`.
    pub fn invocation(&mut self, node: Node<'a>, state: &mut State) -> Val {
        let object = node.child_by_field_name("object");
        let receiver = object.map(|object| self.expression(object, state));
        let arguments: Vec<Node> = node.child_by_field_name("arguments").map(named_children).unwrap_or_default();
        let values: Vec<Val> = arguments.iter().map(|argument| self.expression(*argument, state)).collect();
        let name = node.child_by_field_name("name").map_or("", |name| self.context.text(name));
        if let (Some(receiver), [argument]) = (receiver.clone(), &values[..]) {
            if COMPARED.contains(&name) && object.is_none_or(|object| object.kind() != "super") {
                self.site(node, receiver, argument.clone(), state);
            }
        }
        self.invoked(vec![node]);
        let boxes = |part: Node<'a>| boxed(&self.type_of(part));
        let kept = match (&receiver, &values[..]) {
            (Some(receiver), []) if name.ends_with("Value") && object.is_some_and(boxes) => Some(receiver.clone()),
            (_, [argument]) if name == "valueOf" && boxes(node) && arguments.first().is_some_and(|part| primitive(&self.type_of(*part))) => Some(argument.clone()),
            _ => None,
        };
        match kept.filter(|_| self.mode == Mode::Stack) {
            Some(kept) => self.converted(kept, true),
            None => self.numbers.fresh(),
        }
    }
}
