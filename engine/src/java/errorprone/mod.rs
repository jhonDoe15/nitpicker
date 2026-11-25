//! Error Prone checks written for the engine: same check name, line and column as Error Prone reports.
mod doc;
mod docparse;
mod docref;
mod annotated;
mod docplaced;
mod doctagged;
mod doctags;
#[cfg(test)]
mod doctest;
mod hierarchy;
mod javadoc;
mod members;
mod nullaway;
pub use nullaway::unread_marks;
mod operators;
mod returns;
mod names;
mod naming;
mod obsolete;
mod simple;
mod assigned;
mod signatures;
mod statements;
mod targets;
mod throws;
mod time;
mod unused_methods;
mod immutable;
mod immutable_known;
mod keep;
mod boxed;
mod interrupts;
mod vars;
mod mutability;
mod locale;
mod futures;
mod redundant;
mod tokens;
mod unused;
mod values;

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
    /// The class each name in the file stands for, as written and in full: two checks read every name.
    pub named: std::cell::RefCell<std::collections::HashMap<usize, Option<(String, String)>>>,
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
        self.report_always(check, offset, message);
    }
    /// Reports without looking for a suppression: some checks report from the file as a whole.
    pub fn report_always(&self, check: &'static str, offset: usize, message: &str) {
        if self.selected.as_ref().is_some_and(|names| !names.iter().any(|name| name == check)) {
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
            symbol: None,
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
    /// The line of a byte offset, from zero.
    pub fn line_of(&self, offset: usize) -> usize {
        self.line_starts.partition_point(|start| *start <= offset) - 1
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

/// Each check with the names it reports under: a run that selects checks skips the others.
const CHECKS: &[(&[&str], Check)] = &[
    (&["OperatorPrecedence"], operators::operator_precedence),
    (&["ReferenceEquality"], operators::reference_equality),
    (&["UngroupedOverloads"], members::ungrouped_overloads),
    (&["MissingOverride"], members::missing_override),
    (&["PrivateConstructorForUtilityClass"], members::private_constructor_for_utility_class),
    (&["InconsistentOverloads"], members::inconsistent_overloads),
    (&["BuilderReturnThis"], members::builder_return_this),
    (&["EffectivelyPrivate"], members::effectively_private),
    (&["MissingBraces"], simple::missing_braces),
    (&["EmptyCatch"], simple::empty_catch),
    (&["NonFinalStaticField"], simple::non_final_static_field),
    (&["ThrowSpecificExceptions"], simple::throw_specific_exceptions),
    (&["SystemOut"], simple::system_out),
    (&["JavaUtilDate"], simple::java_util_date),
    (&["StringCaseLocaleUsage"], simple::string_case_locale_usage),
    (&["AssertFalse"], values::assert_false),
    (&["EnumOrdinal"], values::enum_ordinal),
    (&["VoidUsed"], values::void_used),
    (&["ObjectEqualsForPrimitives"], values::object_equals_for_primitives),
    (&["UnnecessaryParentheses"], values::unnecessary_parentheses),
    (&["UnusedException"], values::unused_exception),
    (&["StringSplitter"], values::string_splitter),
    (&["JdkObsolete"], obsolete::jdk_obsolete),
    (&["BooleanLiteral"], targets::boolean_literal),
    (&["IdentifierName"], naming::identifier_name),
    (&["EmptyBlockTag", "MissingSummary", "InvalidBlockTag", "UnescapedEntity", "EscapedEntity", "InvalidInlineTag"], javadoc::javadoc),
    (&["AnnotationPosition"], annotated::annotation_position),
    (&["RedundantOverride"], redundant::redundant_override),
    (&["CheckedExceptionNotThrown"], throws::checked_exception_not_thrown),
    (&["CheckReturnValue"], returns::check_return_value),
    (&["MultiVariableDeclaration"], statements::multi_variable_declaration),
    (&["ArrayRecordComponent"], statements::array_record_component),
    (&["ReturnAtTheEndOfVoidFunction"], statements::return_at_the_end_of_void_function),
    (&["AssignmentExpression"], statements::assignment_expression),
    (&["ProtectedMembersInFinalClass"], statements::protected_members_in_final_class),
    (&["UnnecessarySemicolon"], statements::unnecessary_semicolon),
    (&["RedundantThrows"], statements::redundant_throws),
    (&["UnnecessaryBoxedAssignment"], assigned::unnecessary_boxed_assignment),
    (&["IntLongMath"], assigned::int_long_math),
    (&["InitializeInline"], assigned::initialize_inline),
    (&["ExposedPrivateType"], signatures::exposed_private_type),
    (&["PreferJavaTimeOverload"], time::prefer_java_time_overload),
    (&["DefaultLocale"], locale::default_locale),
    (&["MixedMutabilityReturnType"], mutability::mixed_mutability_return_type),
    (&["InterruptedExceptionSwallowed"], interrupts::interrupted_exception_swallowed),
    (&["FutureReturnValueIgnored"], futures::future_return_value_ignored),
    (&["ImmutableEnumChecker"], immutable::immutable_enum_checker),
    (&["TypeParameterNaming"], names::type_parameter_naming),
    (&["WildcardImport"], names::wildcard_import),
    (&["SameNameButDifferent"], names::same_name_but_different),
    (&["DifferentNameButSame"], names::different_name_but_same),
    (&["UnnecessarilyFullyQualified"], names::unnecessarily_fully_qualified),
    (&["SuppressWarningsWithoutExplanation"], names::suppress_warnings_without_explanation),
    (&["TypeParameterUnusedInFormals"], names::type_parameter_unused_in_formals),
    (&["NullAway"], nullaway::null_away),
];

/// Checks that look at a whole file. They run after the walk: a call they work out ahead of the checks above would
/// leave the resolver with answers found in a different order.
const FILE_CHECKS: &[(&[&str], Check)] = &[
    (&["UnnecessaryBoxedVariable"], boxed::unnecessary_boxed_variable),
    (&["UnusedMethod"], unused_methods::unused_method),
    (&["NotJavadoc"], docplaced::not_javadoc),
    (&["AlmostJavadoc"], docplaced::almost_javadoc),
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
        let context = Context { resolver, file, line_starts, selected, out: std::cell::RefCell::new(Vec::new()), named: std::cell::RefCell::new(std::collections::HashMap::new()) };
        let wanted = |names: &[&str]| context.selected.as_ref().is_none_or(|selected| names.iter().any(|name| selected.iter().any(|one| one == name)));
        let checks: Vec<Check> = CHECKS.iter().filter(|(names, _)| wanted(names)).map(|(_, check)| *check).collect();
        walk(file.tree.root_node(), |node| {
            if node.is_named() {
                for check in &checks {
                    check(&context, node);
                }
            }
        });
        for (_, check) in FILE_CHECKS.iter().filter(|(names, _)| wanted(names)) {
            check(&context, file.tree.root_node());
        }
        out.append(&mut context.out.into_inner());
    }
}
