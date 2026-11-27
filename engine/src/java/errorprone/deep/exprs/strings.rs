//! javac's parser folds adjacent string literals of a `+` chain into one literal, and a `-` written before a decimal
//! integer literal into a negative literal.
use super::super::tree::Build;
use super::operator;
use crate::engine::source::parent;
use tree_sitter::Node;

pub fn is_plus<'t>(node: Node<'t>, text: &str) -> bool {
    node.kind() == "binary_expression" && operator(node).is_some_and(|found| &text[found.byte_range()] == "+")
}

/// An operand of a `+` chain after javac's folding: one literal standing for a run of string literals, or a tree.
pub enum Operand<'t> {
    Merged(usize),
    Tree(Node<'t>),
}

impl<'c, 't> Build<'c, 't> {
    /// The operands of the `+` chain a binary expression roots, after folding, when anything folds.
    pub fn folded(&self, node: Node<'t>) -> Option<Vec<Operand<'t>>> {
        let text = &self.context.file.text;
        if !is_plus(node, text) || parent(node).is_some_and(|up| matches!(up.kind(), "binary_expression" | "instanceof_expression")) {
            return None;
        }
        let mut operands = Vec::new();
        let mut current = node;
        while is_plus(current, text) {
            operands.extend(current.child_by_field_name("right"));
            current = current.child_by_field_name("left")?;
        }
        operands.push(current);
        operands.reverse();
        let mut merged = Vec::new();
        let mut folds = false;
        let mut index = 0;
        while index < operands.len() {
            let run = operands[index..].iter().take_while(|part| part.kind() == "string_literal").count();
            if run >= 2 {
                merged.push(Operand::Merged(operands[index].start_byte()));
                folds = true;
                index += run;
            } else {
                merged.push(Operand::Tree(operands[index]));
                index += 1;
            }
        }
        folds.then_some(merged)
    }

    pub fn operand_start(operand: &Operand<'t>) -> usize {
        match operand {
            Operand::Merged(at) => *at,
            Operand::Tree(node) => node.start_byte(),
        }
    }

    pub fn chain(&mut self, operands: &[Operand<'t>], level: usize) {
        let (last, rest) = operands.split_last().expect("operands");
        if rest.is_empty() {
            self.operand(last, level);
            return;
        }
        self.push(level, "PLUS", Some(Self::operand_start(last)), None);
        self.chain(rest, level + 1);
        self.operand(last, level + 1);
    }

    pub fn operand(&mut self, operand: &Operand<'t>, level: usize) {
        match operand {
            Operand::Merged(at) => self.push(level, "STRING_LITERAL", Some(*at), None),
            Operand::Tree(node) => self.expr(*node, level),
        }
    }

    /// `-` and a decimal integer literal: javac's parser reads them as one negative literal.
    pub fn negative_literal(&self, node: Node<'t>) -> Option<Node<'t>> {
        let operand = node.child_by_field_name("operand").filter(|operand| operand.kind() == "decimal_integer_literal" && !self.text(*operand).starts_with('0'))?;
        operator(node).filter(|found| self.text(*found) == "-").map(|_| operand)
    }
}
