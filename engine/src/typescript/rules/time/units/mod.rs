//! `time-unit-mismatch`: time values in different units mixed without a conversion, and epoch times cut to 32 bits.
//! Written without type information, as the rule runs when the file has no program.
mod constants;
mod names;
mod nodes;
mod parameters;
mod values;

use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use constants::Env;
use names::{Unit, conversion_example, unit_factor, unit_of_name};
use nodes::{callee_text, property_name, shown, string_literal, unwrap};
use parameters::parameter_units;
use values::{UnitValue, is_narrowing, mismatch, value_unit};

const RULE: &str = "time-unit-mismatch";
const MIXING: [&str; 10] = ["+", "-", "<", "<=", ">", ">=", "==", "!=", "===", "!=="];

type Found = Vec<(u32, u32, String)>;

struct Checker<'a, 's> {
    env: Env<'a, 's>,
    found: Found,
}

fn mixed(left: (&str, Unit), right: (&str, Unit)) -> String {
    let (left_text, left_unit) = left;
    let (right_text, right_unit) = right;
    let factor = unit_factor(right_unit, left_unit);
    let example = conversion_example(right_text, right_unit, left_unit);
    format!(
        "`{left_text}` is in {} and `{right_text}` is in {}, so the result is off by {factor}x. \
         Bring both sides to one unit first: convert the value once where it enters (`{example}`), \
         and name the result with its unit.",
        left_unit.label(),
        right_unit.label()
    )
}

fn assigned(target: (&str, Unit), value: (&str, Unit)) -> String {
    let factor = unit_factor(value.1, target.1);
    let example = conversion_example(value.0, value.1, target.1);
    format!(
        "`{}` is named in {} but gets `{}`, which is in {} (off by {factor}x). \
         Convert the value once where it enters (`{example}`); or, if the name is wrong, \
         rename it to its real unit.",
        target.0,
        target.1.label(),
        value.0,
        value.1.label()
    )
}

fn argument(callee: &str, parameter: &str, target: Unit, value: (&str, Unit)) -> String {
    let factor = unit_factor(value.1, target);
    let example = conversion_example(value.0, value.1, target);
    format!(
        "`{callee}` takes {} for `{parameter}`, but `{}` is in {} (off by {factor}x). \
         Convert the argument once where it enters (`{example}`).",
        target.label(),
        value.0,
        value.1.label()
    )
}

fn narrowed(value: &str, operator: &str) -> String {
    format!(
        "`{value}` is an epoch time, and `{operator}` cuts it to a 32-bit integer, which overflows \
         (epoch milliseconds already, epoch seconds in 2038). Keep the full number: `Math.trunc({value})`."
    )
}

fn key_name<'v>(property: Node<'v>) -> Option<std::borrow::Cow<'v, str>> {
    if property.flag("computed") {
        return None;
    }
    let key = property.node("key")?;
    if key.is("Identifier") { key.name() } else { string_literal(key) }
}

impl<'a, 's> Checker<'a, 's> {
    fn text(&self, node: Node<'s>) -> String {
        shown(self.env.source, node)
    }

    fn push(&mut self, node: Node<'s>, message: String) {
        self.found.push((node.start(), node.end(), message));
    }

    fn named(&mut self, node: Node<'s>, name: Option<&str>, value: Option<Node<'s>>) {
        let (Some(name), Some(value)) = (name, value) else { return };
        let (Some(target), Some(found)) = (unit_of_name(name), value_unit(self.env, value)) else { return };
        if found.unit != target {
            let text = self.text(value);
            self.push(node, assigned((name, target), (&text, found.unit)));
        }
    }

    fn pattern(&mut self, property: Node<'s>) {
        let value = property.node("value");
        let local = value.and_then(|value| {
            if value.is("AssignmentPattern") { value.node("left") } else { Some(value) }
        });
        let key = key_name(property);
        let local_name = local.filter(|local| local.is("Identifier")).and_then(|local| local.name());
        if let (Some(local), Some(key)) = (local_name, key)
            && let (Some(local_unit), Some(key_unit)) = (unit_of_name(&local), unit_of_name(&key))
            && local_unit != key_unit
        {
            self.push(property, assigned((&local, local_unit), (&key, key_unit)));
        }
    }

    fn call(&mut self, node: Node<'s>) {
        let Some(callee_node) = node.node("callee") else { return };
        let callee = callee_text(callee_node).unwrap_or_else(|| self.text(callee_node));
        let arguments = node.nodes("arguments");
        for parameter in parameter_units(self.env, node) {
            let spread = |argument: &&Node| argument.is("SpreadElement");
            let Some(argument_node) = arguments.get(parameter.index).filter(|argument| !spread(argument)) else {
                continue;
            };
            let Some(found) = value_unit(self.env, *argument_node) else { continue };
            if found.unit != parameter.unit {
                let text = self.text(*argument_node);
                self.push(*argument_node, argument(&callee, &parameter.name, parameter.unit, (&text, found.unit)));
            }
        }
    }

    fn narrowing(&mut self, node: Node<'s>, value: Node<'s>, operator: &str) {
        let Some(UnitValue { unit, epoch: true }) = value_unit(self.env, value) else { return };
        if operator == ">>> 0" && matches!(unit, Unit::S | Unit::Min) {
            return;
        }
        let text = self.text(value);
        self.push(node, narrowed(&text, operator));
    }

    fn binary(&mut self, node: Node<'s>) {
        let operator = node.text("operator").unwrap_or_default();
        let (Some(left_node), Some(right_node)) = (node.node("left"), node.node("right")) else { return };
        if is_narrowing(self.env, node) {
            self.narrowing(node, left_node, &format!("{operator} 0"));
            return;
        }
        if !MIXING.contains(&&*operator) {
            return;
        }
        let (left, right) = (value_unit(self.env, left_node), value_unit(self.env, right_node));
        if let (Some(left), Some(right)) = (left, right)
            && mismatch(Some(left), Some(right))
        {
            let (left_text, right_text) = (self.text(left_node), self.text(right_node));
            self.push(node, mixed((&left_text, left.unit), (&right_text, right.unit)));
        }
    }

    fn unary(&mut self, node: Node<'s>) {
        let Some(inner) = node.node("argument").map(unwrap) else { return };
        let tilde = |node: Node| node.text("operator").as_deref() == Some("~");
        if tilde(node) && inner.is("UnaryExpression") && tilde(inner) {
            if let Some(value) = inner.node("argument") {
                self.narrowing(node, value, "~~");
            }
        }
    }

    fn assignment(&mut self, node: Node<'s>) {
        if !matches!(node.text("operator").as_deref(), Some("=" | "+=" | "-=")) {
            return;
        }
        let Some(target) = node.node("left").map(unwrap) else { return };
        let name = if target.is("Identifier") { target.name() } else { property_name(target) };
        self.named(node, name.as_deref(), node.node("right"));
    }

    fn property(&mut self, node: Node<'s>) {
        if node.parent().is_some_and(|parent| parent.is("ObjectPattern")) {
            self.pattern(node);
        } else if node.text("kind").as_deref() == Some("init") && !node.flag("shorthand") && !node.flag("method") {
            self.named(node, key_name(node).as_deref(), node.node("value"));
        }
    }

    fn visit(&mut self, node: Node<'s>) {
        match node.kind() {
            "BinaryExpression" => self.binary(node),
            "UnaryExpression" => self.unary(node),
            "AssignmentExpression" => self.assignment(node),
            "VariableDeclarator" => {
                let id = node.node("id").filter(|id| id.is("Identifier")).and_then(|id| id.name());
                self.named(node, id.as_deref(), node.node("init"));
            }
            "AssignmentPattern" => {
                let left = node.node("left").filter(|left| left.is("Identifier")).and_then(|left| left.name());
                if !node.parent().is_some_and(|parent| parent.is("Property")) {
                    self.named(node, left.as_deref(), node.node("right"));
                }
            }
            "Property" => self.property(node),
            "PropertyDefinition" => self.named(node, key_name(node).as_deref(), node.node("value")),
            "CallExpression" | "NewExpression" => self.call(node),
            _ => {}
        }
    }
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let mut checker = Checker { env: Env { scopes, source: context.file.text }, found: Vec::new() };
    for node in view.nodes() {
        checker.visit(node);
    }
    for (start, end, message) in checker.found {
        context.report_range(RULE, start, Some(end), message);
    }
}
