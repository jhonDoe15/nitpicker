//! SpotBugs bug patterns rebuilt for the engine from the documented meaning of each pattern and from what
//! SpotBugs 4.9.8 reports on test code: same pattern name, line and message, read from source instead of class files.
mod constructors;
mod expose;
mod fields;
mod handlers;
mod flow;
mod mutable;
mod names;
mod nulls;
mod order;
mod stores;

use super::types::project::JavaProject;
use super::types::scope::{FileScope, Resolver, TYPE_DECLARATIONS};
use crate::engine::source::{ParentTable, SourceFile, children, parent, walk};
use crate::engine::{FileRule, Project, finding::Finding};
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::rc::Rc;
use tree_sitter::Node;

/// What a detector gets: the file, its types and a place to report.
pub struct Context<'a> {
    pub resolver: &'a Resolver<'a>,
    pub file: &'a SourceFile,
    /// Every class declared in the file, by name.
    pub classes: HashMap<String, Node<'a>>,
    /// Per class of the file: the fields only ever given values nobody can change.
    pub fixed: RefCell<HashMap<String, Rc<HashSet<String>>>>,
    /// Fields whose stored values are all of one changeable type, worked out once.
    pub widened: RefCell<Option<Rc<HashSet<(String, String)>>>>,
    /// Every value the file stores in a field, worked out once.
    pub stored: RefCell<Option<Rc<fields::StoredMap<'a>>>>,
    /// Fields being judged by the values stored in them, so that fields stored into each other end the question.
    pub loading: RefCell<HashSet<(String, String)>>,
    line_starts: Vec<usize>,
    selected: Option<Vec<String>>,
    out: RefCell<Vec<Finding>>,
}

impl Context<'_> {
    /// Whether a run restricted to some patterns asks for one of these.
    pub fn wants(&self, patterns: &[&str]) -> bool {
        self.selected.as_ref().is_none_or(|names| names.iter().any(|name| patterns.contains(&name.as_str())))
    }
    /// Reports a pattern on a line unless an enclosing declaration suppresses it.
    pub fn report(&self, pattern: &'static str, at: Node, line: usize, message: String) {
        if self.selected.as_ref().is_some_and(|names| !names.iter().any(|name| name == pattern)) {
            return;
        }
        if self.suppressed(pattern, at) {
            return;
        }
        self.out.borrow_mut().push(Finding { file: self.file.path.clone(), line, column: 1, rule: pattern.to_string(), message });
    }
    /// Whether a declaration around the node carries `@SuppressFBWarnings` naming the pattern, its prefix, or nothing.
    fn suppressed(&self, pattern: &str, node: Node) -> bool {
        let mut current = Some(node);
        while let Some(at) = current {
            if super::errorprone::DECLARATIONS.contains(&at.kind()) && self.suppresses(at, pattern) {
                return true;
            }
            current = parent(at);
        }
        false
    }
    fn suppresses(&self, declaration: Node, pattern: &str) -> bool {
        let Some(modifiers) = crate::java::helpers::modifiers(declaration) else { return false };
        children(modifiers).into_iter().any(|annotation| {
            if !matches!(annotation.kind(), "annotation" | "marker_annotation") {
                return false;
            }
            let name = annotation.child_by_field_name("name").map(|name| self.text(name)).unwrap_or_default();
            if name.rsplit('.').next() != Some("SuppressFBWarnings") {
                return false;
            }
            let mut listed = Vec::new();
            if let Some(arguments) = annotation.child_by_field_name("arguments") {
                for pair in children(arguments) {
                    let justification = pair.kind() == "element_value_pair"
                        && pair.child_by_field_name("key").is_some_and(|key| self.text(key) != "value");
                    if justification {
                        continue;
                    }
                    walk(pair, |part| {
                        if part.kind() == "string_literal" {
                            listed.extend(crate::java::types::expr::literal_text(self.file, part));
                        }
                    });
                }
            }
            listed.is_empty() || listed.iter().any(|value| pattern == value || pattern.starts_with(&format!("{value}_")))
        })
    }
    /// The line of a byte offset, from one.
    pub fn line_at(&self, offset: usize) -> usize {
        self.line_starts.partition_point(|start| *start <= offset)
    }
    pub fn line(&self, node: Node) -> usize {
        self.line_at(node.start_byte())
    }
    pub fn text(&self, node: Node) -> &str {
        self.file.text_of(node)
    }
}

/// A detector looks at one class, enum, record or interface declaration at a time.
type Detector = for<'a> fn(&Context<'a>, Node<'a>);

const DETECTORS: &[Detector] = &[expose::exposed_representation as Detector, constructors::constructor_throw as Detector, nulls::null_dereference as Detector];

pub struct SpotBugs;

impl FileRule for SpotBugs {
    fn id(&self) -> &'static str {
        "_SpotBugs"
    }
    fn needs_project(&self) -> bool {
        true
    }
    fn check(&self, _file: &SourceFile, _out: &mut Vec<Finding>) {}
    fn check_in(&self, file: &SourceFile, project: &Project, out: &mut Vec<Finding>) {
        let Some(project) = project.downcast_ref::<JavaProject>() else { return };
        let scope = &FileScope::of(file);
        let resolver = &Resolver::new(&project.index, file, scope);
        let _parents = ParentTable::of(file.tree.root_node());
        let mut line_starts = vec![0];
        line_starts.extend(file.text.bytes().enumerate().filter(|(_, byte)| *byte == b'\n').map(|(at, _)| at + 1));
        let selected = std::env::var("NP_SB_ONLY").ok().map(|names| names.split(',').map(String::from).collect());
        let mut declared = Vec::new();
        walk(file.tree.root_node(), |node| {
            if TYPE_DECLARATIONS.contains(&node.kind()) {
                declared.push(node);
            }
        });
        let classes = declared.iter().filter_map(|node| Some((scope.names.get(&node.id())?.clone(), *node))).collect();
        let fixed = RefCell::new(HashMap::new());
        let context = Context { resolver, file, classes, fixed, widened: RefCell::new(None), stored: RefCell::new(None), loading: RefCell::new(HashSet::new()), line_starts, selected, out: RefCell::new(Vec::new()) };
        for node in declared {
            for detector in DETECTORS {
                detector(&context, node);
            }
        }
        out.append(&mut context.out.into_inner());
    }
}
