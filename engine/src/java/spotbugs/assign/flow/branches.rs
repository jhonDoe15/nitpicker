//! The statements where paths part and meet: a `switch` (cases fall through) and a `try` (a `finally` block is
//! walked where javac copies it: after the `try` block, after each `catch` block, and once more for exceptions).
use super::Walk;
use super::values::{State, merge, merge_all};
use crate::engine::source::{children, named_children};
use tree_sitter::Node;

impl<'c, 'a> Walk<'c, 'a> {
    pub fn switched(&mut self, node: Node<'a>, state: &mut State) {
        self.condition(node.child_by_field_name("condition"), state);
        if self.selects_by_call(node) {
            self.called();
        }
        let Some(body) = node.child_by_field_name("body") else { return };
        let entry = state.clone();
        let groups = named_children(body);
        let defaulted = groups.iter().any(|group| children(*group).into_iter().any(|part| part.kind() == "switch_label" && self.context.text(part).starts_with("default")));
        let end = self.targeted(Some("switch".to_string()), true, |walk| {
            let mut through: Option<State> = None;
            let mut ends = Vec::new();
            for group in &groups {
                let mut start = merge(Some(entry.clone()), through.take(), &walk.numbers);
                for label in children(*group).into_iter().filter(|part| part.kind() == "switch_label") {
                    if let Some(start) = start.as_mut() {
                        walk.bind(label, start);
                    }
                }
                let parts: Vec<Node> = named_children(*group).into_iter().filter(|part| part.kind() != "switch_label").collect();
                let done = walk.statements(&parts, start);
                if group.kind() == "switch_rule" {
                    ends.push(done);
                } else {
                    through = done;
                }
            }
            ends.push(through);
            if !defaulted {
                ends.push(Some(entry.clone()));
            }
            merge_all(ends, &walk.numbers)
        });
        *state = end.unwrap_or_else(|| entry.clone());
    }

    pub fn tried(&mut self, node: Node<'a>, mut state: State) -> Option<State> {
        if let Some(resources) = node.child_by_field_name("resources") {
            self.expression(resources, &mut state);
        }
        let finally = named_children(node).into_iter().find(|part| part.kind() == "finally_clause").and_then(|part| named_children(part).into_iter().next());
        let before = state.clone();
        let mut done = node.child_by_field_name("body").and_then(|body| self.statement(body, Some(state)));
        if node.kind() == "try_with_resources_statement" {
            self.called();
        }
        let entry = merge(Some(before), done.clone(), &self.numbers);
        if let Some(finally) = finally {
            done = self.statement(finally, done);
        }
        let mut ends = vec![done];
        for part in named_children(node).into_iter().filter(|part| part.kind() == "catch_clause") {
            let mut start = entry.clone();
            let parameter = named_children(part).into_iter().find(|piece| piece.kind() == "catch_formal_parameter").and_then(|piece| piece.child_by_field_name("name"));
            if let (Some(start), Some(name)) = (start.as_mut(), parameter) {
                start.locals.insert(self.context.text(name).to_string(), self.numbers.fresh());
            }
            let mut end = part.child_by_field_name("body").and_then(|body| self.statement(body, start));
            if let Some(finally) = finally {
                end = self.statement(finally, end);
            }
            ends.push(end);
        }
        if let Some(finally) = finally {
            drop(self.statement(finally, entry));
        }
        merge_all(ends, &self.numbers)
    }
}
