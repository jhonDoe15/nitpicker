//! What an expression leaves behind: a parameter, a value read from a field, a value nobody can change, or anything else.
use super::{Item, State, Store, Walker};
use crate::engine::source::named_children;
use tree_sitter::Node;

/// The variable `p instanceof Type name` declares: it holds what was tested.
fn pattern_variable(test: Node) -> Option<Node> {
    test.child_by_field_name("name").or_else(|| {
        let pattern = named_children(test).into_iter().find(|part| part.kind() == "type_pattern")?;
        named_children(pattern).into_iter().rfind(|part| part.kind() == "identifier")
    })
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
                        Some(Item::Spread) => Item::Param(usize::MAX),
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
            self.stores.insert(node.id(), Store { node, field, own, item: value.clone() });
        }
        value
    }
}
