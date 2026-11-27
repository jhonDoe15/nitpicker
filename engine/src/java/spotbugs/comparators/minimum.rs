//! CO_COMPARETO_RESULTS_MIN_VALUE: a compare method returns the constant `Integer.MIN_VALUE`. SpotBugs leaves the
//! return alone when every path to it went through a two-operand `int` branch (`if_icmp`) that showed a value to be
//! nonzero: `x == c`, `x > c`, `x >= c` with `c > 0` (mirrored for `c < 0`), or `x != y`, `x < y`, `x > y` between
//! two values. Comparisons with a literal `0` on the right (javac's one-operand branch), of `long`, `char` or
//! floating-point values, `switch` labels and reference tests do not count. One finding per method, at the first
//! such return.
use super::super::{Context, folds};
use crate::engine::source::{children, named_children};
use crate::java::types::expr::unwrap;
use tree_sitter::Node;

pub const PATTERN: &str = "CO_COMPARETO_RESULTS_MIN_VALUE";

pub(super) struct Walk<'c, 'a, 't> {
    pub(super) context: &'c Context<'a>,
    pub(super) body: Node<'t>,
    /// Clean states that reach the end of each enclosing loop or switch through `break`, and its head through `continue`.
    breaks: Vec<bool>,
    continues: Vec<bool>,
    found: Option<Node<'t>>,
}

pub fn first_return<'t>(context: &Context, body: Node<'t>) -> Option<Node<'t>> {
    let mut walk = Walk { context, body, breaks: Vec::new(), continues: Vec::new(), found: None };
    walk.statement(body, true);
    walk.found
}

impl<'t> Walk<'_, '_, 't> {
    fn statements(&mut self, list: &[Node<'t>], state: bool) -> bool {
        list.iter().fold(state, |state, statement| self.statement(*statement, state))
    }

    fn statement(&mut self, node: Node<'t>, state: bool) -> bool {
        let field = |name: &str| node.child_by_field_name(name);
        match node.kind() {
            "block" | "constructor_body" | "switch_block_statement_group" => self.statements(&named_children(node), state),
            "return_statement" => {
                let value = named_children(node).into_iter().next();
                if state && self.found.is_none() && value.is_some_and(|value| self.minimum(value)) {
                    self.found = Some(node);
                }
                false
            }
            "throw_statement" => false,
            "break_statement" => {
                if let Some(last) = self.breaks.last_mut() {
                    *last |= state;
                }
                false
            }
            "continue_statement" => {
                if let Some(last) = self.continues.last_mut() {
                    *last |= state;
                }
                false
            }
            "if_statement" => {
                let (yes, no) = field("condition").map_or((state, state), |condition| self.condition(condition, state));
                let then = field("consequence").map_or(yes, |branch| self.statement(branch, yes));
                let otherwise = field("alternative").map_or(no, |branch| self.statement(branch, no));
                then || otherwise
            }
            "while_statement" | "for_statement" => self.repeat(node, state, false),
            "do_statement" => self.repeat(node, state, true),
            "enhanced_for_statement" => {
                let array = field("value").and_then(|value| self.context.resolver.type_of(value)).is_some_and(|kind| matches!(kind, crate::java::types::model::Type::Array(_)));
                self.enter();
                let mut head = state;
                for _ in 0..2 {
                    let out = field("body").map_or(false, |body| self.statement(body, head && !array));
                    head = state || out || *self.continues.last().unwrap_or(&false);
                }
                let broken = self.leave();
                head || broken
            }
            "switch_statement" | "switch_expression" => self.switch(node, state),
            "try_statement" | "try_with_resources_statement" => {
                let mut out = field("body").map_or(state, |body| self.statement(body, state));
                for part in children(node) {
                    match part.kind() {
                        "catch_clause" => out |= part.child_by_field_name("body").map_or(state, |body| self.statement(body, state)),
                        "finally_clause" => {
                            let block = named_children(part).into_iter().find(|block| block.kind() == "block");
                            out = block.map_or(out, |block| self.statement(block, out || state) && out);
                        }
                        _ => {}
                    }
                }
                out
            }
            "labeled_statement" | "synchronized_statement" => named_children(node).into_iter().filter(|part| part.kind() != "identifier").fold(state, |state, part| self.statement(part, state)),
            _ => state,
        }
    }

    fn enter(&mut self) {
        self.breaks.push(false);
        self.continues.push(false);
    }

    fn leave(&mut self) -> bool {
        self.continues.pop();
        self.breaks.pop().unwrap_or(false)
    }

    /// A `while`, `for` or `do` loop: the state at its head joins the way in and the way round.
    fn repeat(&mut self, node: Node<'t>, state: bool, body_first: bool) -> bool {
        if let Some(init) = node.child_by_field_name("init").filter(|init| init.kind() == "local_variable_declaration") {
            self.statement(init, state);
        }
        self.enter();
        let condition = node.child_by_field_name("condition");
        let mut head = state;
        let mut exit = false;
        for _ in 0..2 {
            if body_first {
                let out = node.child_by_field_name("body").map_or(head, |body| self.statement(body, head)) || *self.continues.last().unwrap_or(&false);
                let (yes, no) = condition.map_or((out, false), |condition| self.condition(condition, out));
                exit = no;
                head = state || yes;
            } else {
                let (yes, no) = condition.map_or((head, false), |condition| self.condition(condition, head));
                exit = no;
                let out = node.child_by_field_name("body").map_or(yes, |body| self.statement(body, yes));
                head = state || out || *self.continues.last().unwrap_or(&false);
            }
        }
        let broken = self.leave();
        exit || broken
    }

    /// `switch` jumps by table, which keeps the state for every label.
    fn switch(&mut self, node: Node<'t>, state: bool) -> bool {
        let Some(body) = node.child_by_field_name("body") else { return state };
        self.breaks.push(false);
        let mut out = state;
        let mut fallen = false;
        let mut defaulted = false;
        let mut arrows = false;
        for part in named_children(body) {
            let label = children(part).into_iter().find(|label| label.kind() == "switch_label");
            defaulted |= label.is_some_and(|label| self.context.text(label).trim_start().starts_with("default"));
            match part.kind() {
                "switch_block_statement_group" => fallen = self.statement(part, state || fallen),
                "switch_rule" => {
                    arrows = true;
                    let branch = named_children(part).into_iter().find(|branch| branch.kind() != "switch_label");
                    out |= branch.map_or(state, |branch| if branch.kind() == "expression_statement" { state } else { self.statement(branch, state) });
                }
                _ => {}
            }
        }
        let broken = self.breaks.pop().unwrap_or(false);
        let missing = !defaulted && state;
        if arrows { out || broken || missing } else { fallen || broken || missing }
    }

    /// The clean states after a condition when it holds and when it fails.
    fn condition(&self, node: Node, state: bool) -> (bool, bool) {
        let node = unwrap(node);
        if let Some(fixed) = folds::fixed(self.context, Some(node)) {
            return if fixed { (state, false) } else { (false, state) };
        }
        let operator = node.child_by_field_name("operator").map(|operator| self.context.text(operator));
        match (node.kind(), operator) {
            ("unary_expression", Some("!")) => {
                let (yes, no) = node.child_by_field_name("operand").map_or((state, state), |operand| self.condition(operand, state));
                (no, yes)
            }
            ("binary_expression", Some("&&")) => {
                let (left_yes, left_no) = self.side(node, "left", state);
                let (right_yes, right_no) = self.side(node, "right", left_yes);
                (right_yes, left_no || right_no)
            }
            ("binary_expression", Some("||")) => {
                let (left_yes, left_no) = self.side(node, "left", state);
                let (right_yes, right_no) = self.side(node, "right", left_no);
                (left_yes || right_yes, right_no)
            }
            ("binary_expression", Some(operator)) => match self.nonzero(node, operator) {
                Some((holds, fails)) => (state && !holds, state && !fails),
                None => (state, state),
            },
            _ => (state, state),
        }
    }

    fn side(&self, node: Node, name: &str, state: bool) -> (bool, bool) {
        node.child_by_field_name(name).map_or((state, state), |side| self.condition(side, state))
    }
}
