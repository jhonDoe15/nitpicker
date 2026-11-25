//! What an expression leaves behind: a parameter, a value read from a field, a value nobody can change, or anything else.
use super::{Item, State, Store, Walker};
use super::super::Context;
use crate::engine::source::{named_children, walk};
use std::collections::HashMap;
use tree_sitter::Node;

/// The variable `p instanceof Type name` declares: it holds what was tested.
pub(super) fn pattern_variable(test: Node) -> Option<Node> {
    test.child_by_field_name("name").or_else(|| {
        let pattern = named_children(test).into_iter().find(|part| part.kind() == "type_pattern")?;
        named_children(pattern).into_iter().rfind(|part| part.kind() == "identifier")
    })
}

/// Each variable of a method by the slot javac gives it: the parameters in order, then the locals in the order
/// they are declared.
pub(super) fn slots(context: &Context, parameters: &[Node], body: Node) -> HashMap<String, usize> {
    let mut slots: HashMap<String, usize> = HashMap::new();
    for parameter in parameters {
        if let Some(name) = super::super::expose::parameter_name(*parameter) {
            let next = slots.len();
            slots.entry(context.text(name).to_string()).or_insert(next);
        }
    }
    let mut declared = Vec::new();
    walk(body, |node| {
        let name = match node.kind() {
            "variable_declarator" | "catch_formal_parameter" | "resource" | "enhanced_for_statement" => node.child_by_field_name("name"),
            "instanceof_expression" => pattern_variable(node),
            _ => None,
        };
        declared.extend(name.map(|name| (name.start_byte(), context.text(name).to_string())));
    });
    declared.sort();
    for (_, name) in declared {
        let next = slots.len();
        slots.entry(name).or_insert(next);
    }
    slots
}

const SKIPPED: &[&str] = &["lambda_expression", "class_body", "class_declaration", "interface_declaration", "enum_declaration", "record_declaration"];

impl<'t> Walker<'_, '_, 't> {
    fn passes_argument(&self, call: Node) -> bool {
        let name = call.child_by_field_name("name").map(|name| self.text(name)).unwrap_or_default();
        let owner = call.child_by_field_name("object").map(|object| self.text(object).rsplit('.').next().unwrap_or_default());
        match name {
            "requireNonNull" => owner.is_none_or(|owner| owner == "Objects"),
            "checkNotNull" => owner.is_none_or(|owner| owner == "Preconditions"),
            _ => false,
        }
    }

    pub(super) fn eval(&mut self, node: Node<'t>, state: &mut State) -> Item {
        match node.kind() {
            "parenthesized_expression" => named_children(node).into_iter().next().map_or(Item::Other, |inner| self.eval(inner, state)),
            "cast_expression" => node.child_by_field_name("value").map_or(Item::Other, |value| self.eval(value, state)),
            "identifier" => {
                let name = self.text(node);
                match state.get(name) {
                    Some(item) => item.clone(),
                    None => self.named_field(node, name).map_or(Item::Other, Item::Field),
                }
            }
            "field_access" if node.child_by_field_name("field").is_some_and(|field| field.kind() == "this") => {
                self.outer_this(node).map_or(Item::Other, Item::Field)
            }
            "field_access" => {
                if let Some(object) = node.child_by_field_name("object").filter(|object| !matches!(object.kind(), "this" | "super")) {
                    self.eval(object, state);
                }
                self.accessed_field(node).map_or(Item::Other, |(field, _)| Item::Field(field))
            }
            "assignment_expression" => self.assign(node, state),
            "ternary_expression" => {
                let parts = ["condition", "consequence", "alternative"].map(|field| node.child_by_field_name(field));
                if let Some(condition) = parts[0] {
                    self.eval(condition, state);
                }
                let first = parts[1].map_or(Item::Other, |part| self.eval(part, state));
                let second = parts[2].map_or(Item::Other, |part| self.eval(part, state));
                match first.meet(&second) {
                    Item::Fixed if !super::super::stores::immutable_value(self.context, node) => Item::Other,
                    met => met,
                }
            }
            "method_invocation" => {
                if let Some(object) = node.child_by_field_name("object") {
                    self.eval(object, state);
                }
                let arguments = node.child_by_field_name("arguments").map(named_children).unwrap_or_default();
                let items: Vec<Item> = arguments.into_iter().map(|argument| self.eval(argument, state)).collect();
                if items.len() == 1 && self.passes_argument(node) {
                    return match items.into_iter().next() {
                        Some(Item::Spread) => Item::Param(usize::MAX, false),
                        Some(Item::Param(place, _)) => Item::Param(place, false),
                        Some(item) => item,
                        None => Item::Other,
                    };
                }
                if super::super::stores::immutable_value(self.context, node) { Item::Fixed } else { Item::Other }
            }
            "update_expression" => {
                for operand in named_children(node) {
                    if operand.kind() == "identifier" {
                        if let Some(item) = state.get_mut(self.text(operand)) {
                            *item = Item::Other;
                        }
                    }
                }
                Item::Other
            }
            "switch_expression" => {
                self.switch(node, state);
                Item::Other
            }
            "instanceof_expression" => {
                let tested = node.child_by_field_name("left").map_or(Item::Other, |left| self.eval(left, state));
                if let Some(name) = pattern_variable(node) {
                    state.insert(self.text(name).to_string(), tested);
                }
                Item::Other
            }
            kind if SKIPPED.contains(&kind) => Item::Other,
            _ => {
                for part in named_children(node) {
                    self.eval(part, state);
                }
                Item::Other
            }
        }
    }

    fn assign(&mut self, node: Node<'t>, state: &mut State) -> Item {
        let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return Item::Other };
        let plain = node.child_by_field_name("operator").is_some_and(|operator| self.text(operator) == "=");
        if left.kind() != "identifier" {
            for part in named_children(left) {
                if !matches!(part.kind(), "this" | "super") {
                    self.eval(part, state);
                }
            }
        }
        let value = self.eval(right, state);
        let value = if plain { value } else { Item::Other };
        let target = match left.kind() {
            "identifier" => {
                let name = self.text(left);
                if state.contains_key(name) {
                    state.insert(name.to_string(), value.clone());
                    None
                } else {
                    self.named_field(left, name).map(|field| (field, true))
                }
            }
            "field_access" => self.accessed_field(left),
            _ => None,
        };
        if let Some((field, _)) = &target {
            for held in state.values_mut() {
                if matches!(held, Item::Field(other) if other.declaring == field.declaring && other.name == field.name) {
                    *held = Item::Other;
                }
            }
        }
        if let Some((field, own)) = target.filter(|_| plain) {
            let variable = self.variable(right, state);
            self.stores.insert(node.id(), Store { node, field, own, item: value.clone(), variable });
        }
        value
    }

    /// The variable SpotBugs names for a stored value: the value of a variable is named after the first slot that
    /// holds that same value, so a copy of a parameter is named after the parameter; a value that only a call or
    /// a choice made is held by no variable and is `?`.
    fn variable(&self, value: Node, state: &State) -> String {
        match value.kind() {
            "parenthesized_expression" => named_children(value).into_iter().next().map_or_else(|| "?".to_string(), |inner| self.variable(inner, state)),
            "cast_expression" => value.child_by_field_name("value").map_or_else(|| "?".to_string(), |inner| self.variable(inner, state)),
            "assignment_expression" => value.child_by_field_name("right").map_or_else(|| "?".to_string(), |inner| self.variable(inner, state)),
            "identifier" => {
                let name = self.text(value);
                let holders = |wanted: usize| {
                    let mut holding: Vec<(usize, &String)> = state
                        .iter()
                        .filter(|(_, item)| matches!(item, Item::Param(place, true) if *place == wanted))
                        .filter_map(|(held, _)| self.slots.get(held).map(|slot| (*slot, held)))
                        .collect();
                    holding.sort();
                    holding.first().map(|(_, held)| (*held).clone())
                };
                match state.get(name) {
                    Some(Item::Param(place, true)) => holders(*place).unwrap_or_else(|| name.to_string()),
                    Some(_) => name.to_string(),
                    None => "?".to_string(),
                }
            }
            _ => "?".to_string(),
        }
    }
}
