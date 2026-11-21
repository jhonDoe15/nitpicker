//! PMD's two ways to silence a finding: a `// NOPMD` comment on its line, and `@SuppressWarnings` on a declaration around it.
use super::tree::{PmdTree, ROOT, Value};
use crate::engine::source::SourceFile;
use crate::java::types::scope::Resolver;
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

const MARKER: &str = "NOPMD";

/// The javac warning names PMD also takes as silencing some of its own rules.
fn javac_name_covers(name: &str, rule: &str) -> bool {
    match name {
        "serial" => matches!(rule, "BeanMembersShouldSerialize" | "NonSerializableClass" | "MissingSerialVersionUID"),
        "unused" => matches!(
            rule,
            "UnusedPrivateField" | "UnusedLocalVariable" | "UnusedPrivateMethod" | "UnusedFormalParameter" | "UnusedAssignment" | "SingularField"
        ),
        "fallthrough" => rule == "ImplicitSwitchFallThrough",
        _ => false,
    }
}

pub struct Suppressions {
    /// Lines that carry a `//` comment with the marker.
    lines: Vec<usize>,
    annotated: bool,
    /// What the `@SuppressWarnings` of a node names, by node.
    named: RefCell<HashMap<u32, Rc<Vec<String>>>>,
}

impl Suppressions {
    pub fn of(file: &SourceFile) -> Suppressions {
        let root = file.tree.root_node();
        let mut lines = Vec::new();
        let mut from = 0;
        while let Some(found) = file.text[from..].find(MARKER) {
            let at = from + found;
            let comment = root.descendant_for_byte_range(at, at + MARKER.len()).filter(|node| node.kind() == "line_comment");
            lines.extend(comment.map(|node| node.start_position().row + 1));
            from = at + MARKER.len();
        }
        Suppressions { lines, annotated: file.text.contains("SuppressWarnings"), named: RefCell::new(HashMap::new()) }
    }

    pub fn idle(&self) -> bool {
        self.lines.is_empty() && !self.annotated
    }

    /// Whether a finding of `rule` on node `id`, reported on `line`, is silenced.
    pub fn hides(&self, tree: &PmdTree, file: &SourceFile, resolver: &Resolver, id: u32, line: usize, rule: &str) -> bool {
        if self.lines.contains(&line) {
            return true;
        }
        if !self.annotated {
            return false;
        }
        let mut current = id;
        while current != ROOT {
            let names = self.names(tree, file, resolver, current);
            if names.iter().any(|name| name == "PMD" || name == "all" || name.strip_prefix("PMD.") == Some(rule) || javac_name_covers(name, rule)) {
                return true;
            }
            current = tree.nodes[current as usize].parent;
        }
        false
    }

    fn names(&self, tree: &PmdTree, file: &SourceFile, resolver: &Resolver, id: u32) -> Rc<Vec<String>> {
        if let Some(known) = self.named.borrow().get(&id) {
            return known.clone();
        }
        let kids = |of: u32, name: &'static str| tree.nodes[of as usize].children.iter().copied().filter(move |kid| tree.nodes[*kid as usize].name == name);
        let mut names = Vec::new();
        for list in kids(id, "ModifierList") {
            for annotation in kids(list, "Annotation") {
                if !matches!(tree.attribute(file, annotation, "SimpleName"), Some(Value::Text(name)) if &*name == "SuppressWarnings") {
                    continue;
                }
                let mut stack = tree.nodes[annotation as usize].children.clone();
                while let Some(part) = stack.pop() {
                    let node = &tree.nodes[part as usize];
                    match node.name {
                        "StringLiteral" => {
                            if let Some(Value::Text(value)) = tree.attribute(file, part, "ConstValue") {
                                names.push(value.to_string());
                            }
                        }
                        "VariableAccess" | "FieldAccess" | "InfixExpression" => names.extend(node.source.and_then(|source| resolver.constant_string(source))),
                        "ClassType" => {}
                        _ => stack.extend(node.children.iter().copied()),
                    }
                }
            }
        }
        let names = Rc::new(names);
        self.named.borrow_mut().insert(id, names.clone());
        names
    }
}
