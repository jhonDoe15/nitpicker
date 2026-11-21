//! PMD's remaining Java functions, and patterns the plain regular-expression engine cannot hold.
use super::eval::{Focus, Machine};
use super::value::Item;
use crate::java::pmd::tree::ROOT;
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

thread_local! {
    static BACKTRACKING: RefCell<HashMap<String, Option<Rc<fancy_regex::Regex>>>> = RefCell::new(HashMap::new());
}

/// The node kinds behind the names of PMD's abstract node types.
const GROUPS: &[(&str, &[&str])] = &[("Literal", &["NumericLiteral", "StringLiteral", "CharLiteral", "BooleanLiteral", "NullLiteral"])];

/// Whether `subject` matches a pattern that needs back-references or look-around; `None` when the pattern is not understood.
pub fn backtracking_match(translated: &str, subject: &str) -> Option<bool> {
    let built = BACKTRACKING.with(|cache| {
        cache.borrow_mut().entry(translated.to_string()).or_insert_with(|| fancy_regex::Regex::new(translated).ok().map(Rc::new)).clone()
    })?;
    built.is_match(subject).ok()
}

impl<'a, 't> Machine<'a, 't> {
    /// `pmd-java:nodeIs`: the node is of the named kind, or of a kind the named abstract type covers.
    pub fn node_is(&self, focus: &Focus, name: &str) -> bool {
        let Some(Item::Node(id)) = focus.item else { return false };
        let kind = self.tree.nodes[*id as usize].name;
        kind == name || GROUPS.iter().any(|(group, kinds)| *group == name && kinds.contains(&kind))
    }

    /// The node whose modifier list speaks for a node: the node itself, or for a variable name its declaration.
    pub fn modifier_owner(&self, id: u32) -> Option<u32> {
        let tree = self.tree;
        if tree.nodes[id as usize].name != "VariableId" {
            return Some(id);
        }
        let mut owner = tree.nodes[id as usize].parent;
        if owner != ROOT && tree.nodes[owner as usize].name == "VariableDeclarator" {
            owner = tree.nodes[owner as usize].parent;
        }
        (owner != ROOT).then_some(owner)
    }

    /// The annotations PMD counts as declared on a node: those of its modifier list (for a variable name, the list of its
    /// declaration), else the annotations directly under it.
    fn declared_annotations(&self, id: u32) -> Vec<u32> {
        let tree = self.tree;
        let kids_named = |of: u32, name: &str| -> Vec<u32> {
            tree.nodes[of as usize].children.iter().copied().filter(|kid| tree.nodes[*kid as usize].name == name).collect()
        };
        let Some(owner) = self.modifier_owner(id) else { return Vec::new() };
        match kids_named(owner, "ModifierList").first() {
            Some(list) => kids_named(*list, "Annotation"),
            None => kids_named(owner, "Annotation"),
        }
    }

    /// `pmd-java:hasAnnotation`: the node declares an annotation of the named type.
    pub fn has_annotation(&self, focus: &Focus, name: &str) -> bool {
        let Some(Item::Node(id)) = focus.item else { return false };
        self.declared_annotations(*id).into_iter().any(|annotation| {
            let item = Item::Node(annotation);
            self.type_is(&Focus { item: Some(&item), position: 1, size: 1 }, name, false)
        })
    }
}
