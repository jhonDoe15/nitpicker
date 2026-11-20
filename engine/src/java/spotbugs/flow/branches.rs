//! How the walk follows `try` and `switch`: the paths that leave them meet again behind them.
use super::{Item, State, Walker, meet};
use crate::engine::source::{children, named_children, walk};
use tree_sitter::Node;

impl<'t> Walker<'_, '_, 't> {
    pub(super) fn attempt(&mut self, node: Node<'t>, state: &mut State) -> bool {
        let mut declared = Vec::new();
        if let Some(resources) = node.child_by_field_name("resources") {
            for resource in children(resources).into_iter().filter(|part| part.kind() == "resource") {
                let item = resource.child_by_field_name("value").map_or(Item::Other, |value| self.eval(value, state));
                if let Some(name) = resource.child_by_field_name("name") {
                    declared.push(self.text(name).to_string());
                    state.insert(self.text(name).to_string(), item);
                }
            }
        }
        let mut caught = state.clone();
        let Some(body) = node.child_by_field_name("body") else { return true };
        walk(body, |inner| {
            let target = match inner.kind() {
                "assignment_expression" => inner.child_by_field_name("left"),
                "update_expression" => named_children(inner).into_iter().next(),
                _ => None,
            };
            if let Some(target) = target.filter(|target| target.kind() == "identifier") {
                if let Some(item) = caught.get_mut(self.context.text(target)) {
                    *item = Item::Other;
                }
            }
        });
        let mut ends = Vec::new();
        if self.exec(body, state) {
            ends.push(state.clone());
        }
        let mut last = None;
        for part in children(node) {
            match part.kind() {
                "catch_clause" => {
                    let mut inside = caught.clone();
                    if part.child_by_field_name("body").is_none_or(|handler| self.exec(handler, &mut inside)) {
                        ends.push(inside);
                    }
                }
                "finally_clause" => last = named_children(part).into_iter().find(|inner| inner.kind() == "block"),
                _ => {}
            }
        }
        let completes = !ends.is_empty();
        let mut merged = ends.into_iter().reduce(|a, b| meet(a, &b)).unwrap_or(caught);
        let finished = last.is_none_or(|block| self.exec(block, &mut merged));
        for name in declared {
            merged.remove(&name);
        }
        *state = merged;
        completes && finished
    }

    pub(super) fn switch(&mut self, node: Node<'t>, state: &mut State) -> bool {
        if let Some(condition) = node.child_by_field_name("condition") {
            self.eval(condition, state);
        }
        let Some(body) = node.child_by_field_name("body") else { return true };
        let entry = state.clone();
        self.breaks.push(Vec::new());
        let mut ends = Vec::new();
        let mut fall: Option<State> = None;
        let mut total = false;
        for group in named_children(body) {
            let parts = named_children(group);
            total |= parts.iter().any(|part| part.kind() == "switch_label" && self.text(*part).starts_with("default"));
            let mut inside = fall.take().map_or(entry.clone(), |open| meet(open, &entry));
            if group.kind() == "switch_rule" {
                let completes = parts.last().is_none_or(|last| match last.kind() {
                    "block" | "throw_statement" => self.exec(*last, &mut inside),
                    "expression_statement" => self.exec(*last, &mut inside),
                    _ => {
                        self.eval(*last, &mut inside);
                        true
                    }
                });
                if completes {
                    ends.push(inside);
                }
            } else {
                let statements = parts.into_iter().filter(|part| part.kind() != "switch_label").collect();
                if self.sequence(statements, &mut inside) {
                    fall = Some(inside);
                }
            }
        }
        ends.extend(self.breaks.pop().unwrap_or_default());
        ends.extend(fall);
        if !total {
            ends.push(entry);
        }
        let completes = !ends.is_empty();
        if let Some(merged) = ends.into_iter().reduce(|a, b| meet(a, &b)) {
            *state = merged;
        }
        completes
    }
}
