//! SpotBugs bug patterns rebuilt for the engine from the documented meaning of each pattern and from what
//! SpotBugs 4.9.8 reports on test code: same pattern name, line and message, read from source instead of class files.
mod attributes;
mod calendars;
mod calls;
mod casts;
mod circuit;
mod catches;
mod classes;
mod concurrent;
mod crypto;
mod compare;
mod constructors;
mod dead;
mod dumb;
mod equality;
mod expose;
mod fields;
mod handlers;
mod held;
mod idioms;
mod floats;
mod flow;
mod folds;
mod known;
mod locals;
mod lombok;
mod methods;
mod mutable;
mod names;
mod naming;
mod nulls;
mod order;
mod sequence;
mod resources;
mod returns;
mod serial;
pub mod place;
mod observed;
mod statements;
mod stores;
mod tail;
mod taint;
mod threads;
mod values;

use super::types::project::JavaProject;
use super::types::scope::{FileScope, Resolver, TYPE_DECLARATIONS};
use crate::engine::source::{ParentTable, SourceFile, children, parent, walk};
use crate::engine::{FileRule, Project, finding::Finding};
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use tree_sitter::Node;

/// What a detector gets: the file, its types and a place to report.
pub struct Context<'a> {
    pub resolver: &'a Resolver<'a>,
    pub project: &'a JavaProject,
    /// What the methods of other files of the run do with null.
    pub elsewhere: &'a nulls::Elsewhere,
    pub file: &'a SourceFile,
    /// Every class declared in the file, by name.
    pub classes: HashMap<String, Node<'a>>,
    /// Findings that hang on what the whole run stores in a field.
    waiting: RefCell<Vec<known::Waiting>>,
    pub memo: observed::Memo<'a>,
    /// Classes whose `Class` object the project's code names anywhere.
    pub literals: &'a HashSet<String>,
    pub volatiles: &'a HashSet<(String, String)>,
    pub numbers: &'a HashMap<String, Option<i64>>,
    line_starts: Vec<usize>,
    selected: Option<Vec<String>>,
    out: RefCell<Vec<Finding>>,
    /// The names the compiler makes up for lambdas and anonymous classes, worked out once.
    compiled: std::cell::OnceCell<crate::java::javac::Names<'a>>,
    /// The values the file stores into each field, `None` for a value no one can follow, worked out once.
    pub field_stores: std::cell::OnceCell<HashMap<(String, String), Vec<Option<Node<'a>>>>>,
    /// SE_BAD_FIELD findings that wait for the classes the whole run knows.
    pub serial: RefCell<Vec<serial::Pending>>,
}

impl<'a> Context<'a> {
    /// The context of a file, with its type declarations and the bodies of its anonymous classes.
    pub fn of(resolver: &'a Resolver<'a>, project: &'a JavaProject, elsewhere: &'a nulls::Elsewhere, selected: Option<Vec<String>>) -> (Self, Vec<Node<'a>>) {
        let file = resolver.file;
        let line_starts = std::iter::once(0).chain(file.text.bytes().enumerate().filter(|(_, byte)| *byte == b'\n').map(|(at, _)| at + 1)).collect();
        let mut declared = Vec::new();
        walk(file.tree.root_node(), |node| {
            let unnamed = matches!(node.kind(), "object_creation_expression" | "enum_constant") && children(node).iter().any(|part| part.kind() == "class_body");
            if TYPE_DECLARATIONS.contains(&node.kind()) || unnamed {
                declared.push(node);
            }
        });
        let classes = declared.iter().filter_map(|node| Some((resolver.scope.names.get(&node.id())?.clone(), *node))).collect();
        let context = Context {
            resolver,
            project,
            elsewhere,
            file,
            classes,
            waiting: RefCell::new(Vec::new()),
            memo: observed::Memo::default(),
            literals: &project.literals,
            volatiles: &project.volatiles,
            numbers: &project.numbers,
            line_starts,
            selected,
            out: RefCell::new(Vec::new()),
            compiled: std::cell::OnceCell::new(),
            field_stores: std::cell::OnceCell::new(),
            serial: RefCell::new(Vec::new()),
        };
        (context, declared)
    }

    /// Whether a run restricted to some patterns asks for one of these.
    pub fn wants(&self, patterns: &[&str]) -> bool {
        self.selected.as_ref().is_none_or(|names| names.iter().any(|name| patterns.contains(&name.as_str())))
    }
    pub fn compiled(&self) -> &crate::java::javac::Names<'a> {
        self.compiled.get_or_init(|| crate::java::javac::Names::of(self.resolver, self.file.tree.root_node()))
    }

    /// Reports a pattern on a line unless an enclosing declaration suppresses it.
    pub fn report(&self, pattern: &'static str, at: Node, line: usize, message: String) {
        self.out.borrow_mut().extend(self.finding(pattern, at, line, message));
    }
    /// Reports a pattern with the name SpotBugs gives its place, such as the variable a method stores.
    pub fn report_named(&self, pattern: &'static str, at: Node, line: usize, message: String, symbol: String) {
        let found = self.finding(pattern, at, line, message).map(|finding| Finding { symbol: Some(symbol), ..finding });
        self.out.borrow_mut().extend(found);
    }
    /// Reports a pattern for a field a method of the class `from` hands out, once the run tells that the field is
    /// exposed. `changeable` says whether the declared type of the field can be changed.
    pub fn report_exposed(&self, pattern: &'static str, at: Node, line: usize, message: String, key: known::Key, from: &str, changeable: bool) {
        let Some(finding) = self.finding(pattern, at, line, message) else { return };
        self.waiting.borrow_mut().push(known::Waiting { finding, key, from: from.to_string(), changeable });
    }
    /// Reports a pattern with SpotBugs' priority and the place its SARIF report names: `kind:name`, see `place`.
    pub fn report_placed(&self, pattern: &'static str, at: Node, line: usize, message: String, place: String, priority: u8) {
        let found = self.finding(pattern, at, line, message).map(|finding| Finding { symbol: Some(place), priority: Some(priority), ..finding });
        self.out.borrow_mut().extend(found);
    }
    /// Reports a pattern as `report_placed` does, with the values SpotBugs lists with its message.
    pub fn report_listed(&self, pattern: &'static str, at: Node, line: usize, message: String, place: String, priority: u8, arguments: Vec<String>) {
        let found = self.finding(pattern, at, line, message).map(|finding| Finding { symbol: Some(place), priority: Some(priority), arguments: Some(arguments), ..finding });
        self.out.borrow_mut().extend(found);
    }
    /// A finding as `report_listed` makes it, kept back for the caller to decide its priority later.
    pub fn finding_listed(&self, pattern: &'static str, at: Node, line: usize, message: String, place: String, arguments: Vec<String>) -> Option<Finding> {
        self.finding(pattern, at, line, message).map(|finding| Finding { symbol: Some(place), arguments: Some(arguments), ..finding })
    }
    /// Adds a finding made with `finding_listed`.
    pub fn push(&self, finding: Finding) {
        self.out.borrow_mut().push(finding);
    }
    fn finding(&self, pattern: &'static str, at: Node, line: usize, message: String) -> Option<Finding> {
        if self.selected.as_ref().is_some_and(|names| !names.iter().any(|name| name == pattern)) || self.suppressed(pattern, at) {
            return None;
        }
        Some(Finding { file: self.file.path.clone(), line, column: 1, rule: pattern.to_string(), message, symbol: None, priority: None, arguments: None })
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
    /// Whether a method of the class around a field declaration, or of a class around that one, carries
    /// `@SuppressFBWarnings` naming the pattern: SpotBugs lets it cover the patterns it reports on fields there.
    pub fn suppressed_by_methods(&self, pattern: &str, declaration: Node) -> bool {
        let mut current = parent(declaration);
        while let Some(at) = current {
            let body = matches!(at.kind(), "class_body" | "enum_body" | "enum_body_declarations" | "interface_body");
            if body && children(at).into_iter().any(|member| member.kind() == "method_declaration" && self.suppresses(member, pattern)) {
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

/// A detector looks at one class, enum, record or interface declaration at a time, or at the `new` expression or
/// enum constant that carries the body of an anonymous class.
type Detector = for<'a> fn(&Context<'a>, Node<'a>);

const DETECTORS: &[Detector] = &[
    expose::exposed_representation as Detector,
    constructors::constructor_throw as Detector,
    statements::statements as Detector,
    classes::class_shape as Detector,
    methods::methods as Detector,
    methods::method_patterns as Detector,
    attributes::should_be_static as Detector,
    dead::dead_stores as Detector,
    locals::locals as Detector,
    casts::casts as Detector,
    threads::threads as Detector,
    concurrent::concurrent as Detector,
    idioms::idioms as Detector,
    naming::naming as Detector,
    sequence::sequence as Detector,
    dumb::dumb as Detector,
    tail::tail as Detector,
    calendars::calendars as Detector,
    circuit::circuits as Detector,
];

#[derive(Default)]
pub struct SpotBugs {
    known: known::Known,
    elsewhere: nulls::Elsewhere,
    serial: serial::Serial,
    attributes: attributes::Attributes,
    taint: taint::Derived,
    effects: returns::Effects,
    floats: floats::Floats,
    crypto: crypto::summary::Fields,
}

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
        let selected = std::env::var("NP_SB_ONLY").ok().map(|names| names.split(',').map(String::from).collect());
        let (context, declared) = Context::of(resolver, project, &self.elsewhere, selected);
        for node in &declared {
            for detector in DETECTORS {
                detector(&context, *node);
            }
        }
        compare::ref_comparisons(&context);
        if context.wants(returns::PATTERNS) {
            returns::returns(&context, &self.effects);
        }
        catches::catches(&context);
        resources::resources(&context);
        values::values(&context, &declared);
        nulls::null_dereference(&context, &declared);
        taint::injections(&context, &declared, &self.taint);
        floats::floats(&context, &declared, &self.floats);
        crypto::crypto(&context, &declared, &self.crypto);
        self.known.note(calls::gather(&context), known::gather(&context), context.waiting.take());
        if context.wants(attributes::PATTERNS) {
            let names = self.attributes.names(&project.index, &project.sources);
            self.attributes.note(attributes::gather(&context, names));
        }
        if context.wants(&["SE_BAD_FIELD"]) {
            self.serial.note(serial::referenced(&context), context.serial.take());
        }
        out.append(&mut context.out.into_inner());
    }
    fn finish(&self, project: &Project, out: &mut Vec<Finding>) {
        if let Some(project) = project.downcast_ref::<JavaProject>() {
            self.known.settle(&project.index, out);
            self.serial.settle(project, out);
            self.attributes.settle(&project.index, &project.literals, || self.known.visits(&project.index), out);
            self.taint.settle(project, &self.elsewhere, out);
            self.effects.settle(project, out);
            self.floats.settle(out);
            self.crypto.settle(out);
        }
    }
}
