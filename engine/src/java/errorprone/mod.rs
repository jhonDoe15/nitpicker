//! Error Prone checks written for the engine: same check name, line and column as Error Prone reports.
mod hierarchy;
mod members;
mod nullaway;
mod nullaway_models;
mod operators;
mod simple;

use super::types::project::JavaProject;
use super::types::scope::{FileScope, Resolver};
use crate::engine::source::{ParentTable, SourceFile, children, parent, walk};
use crate::engine::{FileRule, Project, finding::Finding};
use tree_sitter::Node;

/// What a check gets: the file, its types and a place to report.
pub struct Context<'a> {
    pub resolver: &'a Resolver<'a>,
    pub file: &'a SourceFile,
    line_starts: Vec<usize>,
    selected: Option<Vec<String>>,
    out: std::cell::RefCell<Vec<Finding>>,
}

impl Context<'_> {
    /// Reports at a byte offset. The column is javac's: UTF-16 units, a tab moves to the next multiple of eight.
    pub fn report(&self, check: &'static str, matched: Node, offset: usize, message: &str) {
        if self.selected.as_ref().is_some_and(|names| !names.iter().any(|name| name == check)) {
            return;
        }
        if self.suppressed(check, matched) {
            return;
        }
        let line = self.line_starts.partition_point(|start| *start <= offset) - 1;
        let mut column = 0usize;
        for character in self.file.text[self.line_starts[line]..offset].chars() {
            column = if character == '\t' { column / 8 * 8 + 8 } else { column + character.len_utf16() };
        }
        self.out.borrow_mut().push(Finding {
            file: self.file.path.clone(),
            line: line + 1,
            column: column + 1,
            rule: check.to_string(),
            message: format!("[{check}] {message}"),
        });
    }
    /// Whether the node or a declaration around it carries `@SuppressWarnings` with the check's name or "all".
    pub fn suppressed(&self, check: &str, node: Node) -> bool {
        let mut current = Some(node);
        while let Some(at) = current {
            if DECLARATIONS.contains(&at.kind()) && self.suppress_strings(at).iter().any(|name| name == check || name == "all") {
                return true;
            }
            current = parent(at);
        }
        false
    }
    fn suppress_strings(&self, declaration: Node) -> Vec<String> {
        let mut names = Vec::new();
        let Some(modifiers) = crate::java::helpers::modifiers(declaration) else { return names };
        for annotation in children(modifiers) {
            if annotation.kind() != "annotation" {
                continue;
            }
            let name = annotation.child_by_field_name("name").map(|name| self.text(name)).unwrap_or_default();
            if !matches!(name, "SuppressWarnings" | "java.lang.SuppressWarnings" | "SuppressLint" | "android.annotation.SuppressLint") {
                continue;
            }
            let Some(arguments) = annotation.child_by_field_name("arguments") else { continue };
            walk(arguments, |part| {
                if part.kind() == "string_literal" {
                    if let Some(value) = crate::java::types::expr::literal_text(self.file, part) {
                        names.push(value);
                    }
                }
            });
        }
        names
    }
    pub fn text(&self, node: Node) -> &str {
        self.file.text_of(node)
    }
}

pub const DECLARATIONS: &[&str] = &[
    "class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration",
    "method_declaration", "constructor_declaration", "compact_constructor_declaration", "field_declaration",
    "constant_declaration", "local_variable_declaration", "formal_parameter", "spread_parameter", "enum_constant",
    "annotation_type_element_declaration", "catch_formal_parameter", "resource", "enhanced_for_statement", "record_pattern_component",
];

type Check = fn(&Context, Node);

const CHECKS: &[Check] = &[
    operators::operator_precedence,
    operators::reference_equality,
    members::ungrouped_overloads,
    members::missing_override,
    members::private_constructor_for_utility_class,
    members::inconsistent_overloads,
    simple::missing_braces,
    simple::empty_catch,
    simple::non_final_static_field,
    simple::throw_specific_exceptions,
    simple::system_out,
    simple::java_util_date,
    simple::string_case_locale_usage,
    nullaway::null_away,
];

pub struct ErrorProne;

impl FileRule for ErrorProne {
    fn id(&self) -> &'static str {
        "_ErrorProne"
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
        let selected = std::env::var("NP_EP_ONLY").ok().map(|names| names.split(',').map(String::from).collect());
        let context = Context { resolver, file, line_starts, selected, out: std::cell::RefCell::new(Vec::new()) };
        walk(file.tree.root_node(), |node| {
            if node.is_named() {
                for check in CHECKS {
                    check(&context, node);
                }
            }
        });
        out.append(&mut context.out.into_inner());
    }
}
