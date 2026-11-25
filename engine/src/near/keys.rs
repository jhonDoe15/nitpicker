use super::text::without_lone;
use super::tree::{Node, Text, Tree, json_text};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fmt::Write;

#[derive(Clone, Copy, PartialEq)]
pub enum Bound {
    Number,
    Erase,
    Id,
}

#[derive(Clone)]
pub struct KeyMode<'a> {
    pub bound: Bound,
    pub values: bool,
    pub parameters: Option<&'a HashMap<Text, usize>>,
}

pub const ABSTRACT: KeyMode<'static> = KeyMode { bound: Bound::Number, values: false, parameters: None };
pub const OWN: KeyMode<'static> = KeyMode { bound: Bound::Id, values: true, parameters: None };

pub fn shape_mode(parameters: &HashMap<Text, usize>) -> KeyMode<'_> {
    KeyMode { bound: Bound::Erase, values: true, parameters: Some(parameters) }
}

struct Keyer<'a> {
    mode: &'a KeyMode<'a>,
    numbers: HashMap<Option<Text>, usize>,
    out: String,
}

impl Keyer<'_> {
    fn bound_label(&mut self, node: &Node) {
        match self.mode.bound {
            Bound::Erase => {
                let position = node.value.as_ref().and_then(|value| self.mode.parameters?.get(value));
                match position {
                    Some(position) => write!(self.out, "p{position}").expect("write"),
                    None => self.out.push('b'),
                }
            }
            Bound::Id => {
                self.out.push_str("b=");
                json_text(&mut self.out, node.value.as_deref());
            }
            Bound::Number => {
                let next = self.numbers.len();
                let number = *self.numbers.entry(node.value.clone()).or_insert(next);
                write!(self.out, "b{number}").expect("write");
            }
        }
    }

    fn label(&mut self, node: &Node) {
        if node.is("name") {
            if node.binding.as_deref() == Some("bound") {
                self.bound_label(node);
            } else if self.mode.values {
                self.out.push_str("f=");
                json_text(&mut self.out, node.value.as_deref());
            } else {
                self.out.push('f');
            }
            return;
        }
        if node.is("literal") {
            self.out.push_str("l:");
            self.out.push_str(node.literal.as_deref().unwrap_or(""));
            if self.mode.values {
                self.out.push('=');
                json_text(&mut self.out, node.value.as_deref());
            }
            return;
        }
        self.out.push_str(&node.kind);
        if let Some(value) = &node.value {
            self.out.push('=');
            json_text(&mut self.out, Some(value));
        }
        if node.commutes == Some(true) {
            self.out.push('#');
        }
    }

    fn walk(&mut self, node: &Node) {
        self.out.push('(');
        self.label(node);
        for child in &node.children {
            self.walk(child);
        }
        self.out.push(')');
    }
}

pub fn key_of(root: &Node, mode: &KeyMode) -> String {
    let mut keyer = Keyer { mode, numbers: HashMap::new(), out: String::new() };
    keyer.walk(root);
    keyer.out
}

pub fn parameter_positions(tree: &Tree) -> HashMap<Text, usize> {
    let mut positions = HashMap::new();
    if tree.is("function") {
        for (index, parameter) in tree.child(1).children.iter().enumerate() {
            let name = parameter.children.get(1);
            if let Some(name) = name.filter(|name| name.is_bound())
                && let Some(value) = &name.value
            {
                positions.insert(value.clone(), index);
            }
        }
    }
    positions
}

pub fn digest(text: &str) -> String {
    let mut out = String::with_capacity(64);
    for byte in Sha256::digest(without_lone(text).as_bytes()) {
        write!(out, "{byte:02x}").expect("write");
    }
    out
}
