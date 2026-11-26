//! PMD's two ways to silence a finding: `@SuppressWarnings` on a declaration around it, and a `// NOPMD` comment on
//! its line. Each suppressor that silenced a finding is remembered, for UnnecessaryWarningSuppression.
use super::tree::{PmdTree, ROOT, Value};
use crate::engine::source::SourceFile;
use crate::java::types::scope::Resolver;
use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::rc::Rc;

/// PMD's `--suppress-marker`: `NP_SUPPRESS_MARKER` when set, else PMD's own default.
fn marker() -> &'static str {
    static MARKER: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    MARKER.get_or_init(|| std::env::var("NP_SUPPRESS_MARKER").ok().filter(|marker| !marker.is_empty()).unwrap_or_else(|| "NOPMD".to_string()))
}

/// The javac warning names PMD also takes as silencing some of its own rules.
fn javac_name_covers(name: &str, rule: &str) -> bool {
    match name {
        "serial" => matches!(rule, "BeanMembersShouldSerialize" | "NonSerializableClass" | "MissingSerialVersionUID"),
        "unused" => matches!(
            rule,
            "UnusedPrivateField" | "UnusedLocalVariable" | "UnusedPrivateMethod" | "UnusedFormalParameter" | "UnusedAssignment" | "SingularField"
        ),
        _ => false,
    }
}

pub fn pmd_name(value: &str) -> bool {
    value == "PMD" || value.starts_with("PMD.")
}

fn silences(value: &str, rule: &str) -> bool {
    value == "PMD" || value == "all" || value.strip_prefix("PMD.") == Some(rule) || javac_name_covers(value, rule)
}

/// PMD's order of specificity: `all`, then names of other tools, then `PMD`, then `PMD.Rule`.
fn rank(value: &str) -> u8 {
    match value {
        "all" => 0,
        "PMD" => 2,
        _ if pmd_name(value) => 3,
        _ => 1,
    }
}

/// A `@SuppressWarnings` annotation and its string values, by node.
pub struct Warning {
    pub annotation: u32,
    pub parts: Vec<(u32, String)>,
}

pub struct Suppressions {
    /// The `//` comments that carry the marker, by line: PMD keeps one per line.
    comments: BTreeMap<usize, usize>,
    annotated: bool,
    named: RefCell<HashMap<u32, Rc<Vec<Warning>>>>,
    used_parts: RefCell<HashSet<u32>>,
    used_lines: RefCell<HashSet<usize>>,
}

impl Suppressions {
    pub fn of(file: &SourceFile) -> Suppressions {
        let root = file.tree.root_node();
        let mut comments = BTreeMap::new();
        let mut from = 0;
        let marker = marker();
        while let Some(found) = file.text[from..].find(marker) {
            let at = from + found;
            let comment = root.descendant_for_byte_range(at, at + marker.len()).filter(|node| node.kind() == "line_comment");
            if let Some(comment) = comment {
                comments.insert(comment.start_position().row + 1, comment.start_byte());
            }
            from = at + marker.len();
        }
        Suppressions {
            comments,
            annotated: file.text.contains("SuppressWarnings"),
            named: RefCell::new(HashMap::new()),
            used_parts: RefCell::new(HashSet::new()),
            used_lines: RefCell::new(HashSet::new()),
        }
    }

    pub fn idle(&self) -> bool {
        self.comments.is_empty() && !self.annotated
    }

    /// Whether a finding of `rule` on node `id`, reported on `line`, is silenced; the suppressor that silences it is
    /// marked as used.
    pub fn hides(&self, tree: &PmdTree, file: &SourceFile, resolver: &Resolver, id: u32, line: usize, rule: &str) -> bool {
        if self.annotated {
            if self.suppresses(tree, file, resolver, id, rule) {
                return true;
            }
            let root_kids = if tree.nodes[id as usize].parent == ROOT { tree.nodes[id as usize].children.clone() } else { Vec::new() };
            if root_kids.into_iter().any(|kid| self.suppresses(tree, file, resolver, kid, rule)) {
                return true;
            }
            let mut current = tree.nodes[id as usize].parent;
            while current != ROOT {
                if self.suppresses(tree, file, resolver, current, rule) {
                    return true;
                }
                current = tree.nodes[current as usize].parent;
            }
        }
        if self.comments.contains_key(&line) {
            self.used_lines.borrow_mut().insert(line);
            return true;
        }
        false
    }

    fn suppresses(&self, tree: &PmdTree, file: &SourceFile, resolver: &Resolver, id: u32, rule: &str) -> bool {
        for warning in self.warnings(tree, file, resolver, id).iter() {
            let applicable: Vec<&(u32, String)> = warning.parts.iter().filter(|(_, value)| silences(value, rule)).collect();
            let chosen = if applicable.iter().all(|(_, value)| pmd_name(value)) {
                let top = applicable.iter().map(|(_, value)| rank(value)).max();
                applicable.iter().rev().find(|(_, value)| Some(rank(value)) == top)
            } else {
                let bottom = applicable.iter().map(|(_, value)| rank(value)).min();
                applicable.iter().find(|(_, value)| Some(rank(value)) == bottom)
            };
            if let Some((part, _)) = chosen {
                self.used_parts.borrow_mut().insert(*part);
                return true;
            }
        }
        false
    }

    pub fn part_used(&self, part: u32) -> bool {
        self.used_parts.borrow().contains(&part)
    }

    /// The marked comments that silenced nothing: line and byte offset of each.
    pub fn unused_comments(&self) -> Vec<(usize, usize)> {
        let used = self.used_lines.borrow();
        self.comments.iter().filter(|(line, _)| !used.contains(line)).map(|(line, byte)| (*line, *byte)).collect()
    }

    pub fn annotated(&self) -> bool {
        self.annotated
    }

    /// The `@SuppressWarnings` annotations a node carries, with the string values each names.
    pub fn warnings(&self, tree: &PmdTree, file: &SourceFile, resolver: &Resolver, id: u32) -> Rc<Vec<Warning>> {
        if let Some(known) = self.named.borrow().get(&id) {
            return known.clone();
        }
        let kids = |of: u32, name: &'static str| tree.nodes[of as usize].children.iter().copied().filter(move |kid| tree.nodes[*kid as usize].name == name);
        let mut found = Vec::new();
        for list in kids(id, "ModifierList") {
            for annotation in kids(list, "Annotation") {
                found.extend(warning(tree, file, resolver, annotation));
            }
        }
        let found = Rc::new(found);
        self.named.borrow_mut().insert(id, found.clone());
        found
    }
}

/// A `@SuppressWarnings` annotation as PMD walks it: each value of its `value` member that is a constant string.
pub fn warning(tree: &PmdTree, file: &SourceFile, resolver: &Resolver, annotation: u32) -> Option<Warning> {
    let kids = |of: u32, name: &'static str| tree.nodes[of as usize].children.iter().copied().filter(move |kid| tree.nodes[*kid as usize].name == name);
    if !matches!(tree.attribute(file, annotation, "SimpleName"), Some(Value::Text(name)) if &*name == "SuppressWarnings") {
        return None;
    }
    let written = kids(annotation, "ClassType").next().and_then(|kind| tree.nodes[kind as usize].source);
    if written.and_then(|kind| resolver.type_node(kind)).is_some_and(|kind| kind.erased().name() != "java.lang.SuppressWarnings") {
        return None;
    }
    let mut parts = Vec::new();
    for list in kids(annotation, "AnnotationMemberList") {
        for pair in kids(list, "MemberValuePair") {
            if !matches!(tree.attribute(file, pair, "Name"), Some(Value::Text(name)) if &*name == "value") {
                continue;
            }
            for &value in &tree.nodes[pair as usize].children {
                let values = if tree.nodes[value as usize].name == "MemberValueArrayInitializer" { tree.nodes[value as usize].children.clone() } else { vec![value] };
                for part in values {
                    let node = &tree.nodes[part as usize];
                    let text = match node.name {
                        "StringLiteral" => match tree.attribute(file, part, "ConstValue") {
                            Some(Value::Text(value)) => Some(value.to_string()),
                            _ => None,
                        },
                        _ => node.source.and_then(|source| resolver.constant_string(source)),
                    };
                    parts.extend(text.map(|text| (part, text)));
                }
            }
        }
    }
    Some(Warning { annotation, parts })
}
