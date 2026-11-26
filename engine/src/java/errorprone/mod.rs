//! Error Prone checks written for the engine: same check name, line and column as Error Prone reports.
mod doc;
mod docparse;
mod docref;
pub mod fixes;
mod annotated;
mod ban;
mod comments;
mod parameter_comment;
mod text_blocks;
mod streams;
mod strong_time;
mod references;
mod reflection;
mod buffers;
mod call_match;
mod argsel;
mod argsel_algo;
mod argsel_heuristics;
mod argsel_types;
mod casts;
mod catching;
mod ignorable;
mod collections;
mod built_collections;
mod compare_zero;
mod constants;
mod depann;
mod literals;
mod self_assignment;
mod finally_block;
mod locking;
mod lookup;
mod docplaced;
mod doctagged;
mod doctags;
mod equality;
mod equals_methods;
mod nodes;
mod inference;
mod threads;
mod symbols;
mod dcl;
mod misc;
mod shadow;
mod statics;
mod nullcheck;
mod donot;
mod fieldlocal;
#[cfg(test)]
mod doctest;
mod hierarchy;
mod docinline;
mod javadoc;
mod nullcompare;
mod protosetter;
mod timeunit;
mod members;
mod fix_helpers;
mod nullaway;
mod equality_fix;
mod nullness;
mod flow_nullness;
mod operators;
mod returns;
mod namefixes;
mod renames;
mod names;
mod typevars;
mod naming;
mod obsolete;
mod obsolete_fix;
mod simple;
mod splitter_fix;
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
mod lexical;
mod types;
mod strings;
mod clash;
mod canonical;
mod doc_throws;
mod default_charset;
mod builders;
mod sync;
mod charsets;
mod shape;
mod boxed;
mod boxed_fixes;
mod exposed_fixes;
mod ignored_fix;
mod interrupts;
mod vars;
mod mutability;
mod mutability_fix;
mod locale;
mod locale_fix;
mod futures;
mod redundant;
mod tokens;
mod positions;
mod testcode;
mod arrays;
mod array_values;
mod misc_calls;
mod branches;
mod contracts;
mod time_checks;
mod decl_checks;
mod undefined_equality;
mod unnecessary_async;
mod unused_nested;
mod anonymous_class;
mod modified_unused;
mod return_from_void;
mod unused;
mod unused_fix;
mod values;
mod consts;
mod parts;
mod qualify;
mod unsafe_calls;
mod target;
mod numeric;
mod varargs;
mod imports;
mod finals;
mod classes3;
mod deadlock;
mod switches;
mod capital;
mod dedupe;
mod docparams;
mod compat;
mod equalsincompat;
mod doclinks;
mod object_to_string;
mod constant_pattern;
mod already_checked;
mod already_pure;
mod ignored_matchers;
mod returns_ignored;

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
    /// Reports with Error Prone's "Did you mean" sentence for the check's suggested fixes.
    pub fn report_fixed(&self, check: &'static str, matched: Node, offset: usize, message: &str, fixes: &[fixes::Fix]) {
        if self.selected.as_ref().is_some_and(|names| !names.iter().any(|name| name == check)) || self.suppressed(check, matched) {
            return;
        }
        self.report_always(check, offset, &format!("{message}{}", fixes::sentence(&self.file.text, fixes)));
    }
    /// Reports at a raw position with the sentence for the fixes, without looking for a suppression.
    pub fn report_always_fixed(&self, check: &'static str, offset: usize, message: &str, fixes: &[fixes::Fix]) {
        self.report_always(check, offset, &format!("{message}{}", fixes::sentence(&self.file.text, fixes)));
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
            priority: None,
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
    (&["EmptyBlockTag", "MissingSummary", "InvalidBlockTag", "UnescapedEntity", "EscapedEntity", "InvalidInlineTag", "InvalidThrows", "InvalidParam", "InvalidLink", "MalformedInlineTag", "PreferThrowsTag"], javadoc::javadoc),
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
    (&["EqualsHashCode"], equals_methods::equals_hash_code),
    (&["EqualsUsingHashCode"], equals_methods::equals_using_hash_code),
    (&["ThrowableEqualsHashCode"], equals_methods::throwable_equals_hash_code),
    (&["NonOverridingEquals"], equals_methods::non_overriding_equals),
    (&["ThreadLocalUsage"], threads::thread_local_usage),
    (&["ThreadPriorityCheck"], threads::thread_priority_check),
    (&["WaitNotInLoop"], threads::wait_not_in_loop),
    (&["InputStreamSlowMultibyteRead"], threads::input_stream_slow_multibyte_read),
    (&["DoubleCheckedLocking"], dcl::double_checked_locking),
    (&["ObjectsHashCodePrimitive"], misc::objects_hash_code_primitive),
    (&["LogicalAssignment"], misc::logical_assignment),
    (&["ArrayAsKeyOfSetOrMap"], misc::array_as_key_of_set_or_map),
    (&["ComputeIfAbsentAmbiguousReference"], misc::compute_if_absent_ambiguous_reference),
    (&["VariableNameSameAsType"], shadow::variable_name_same_as_type),
    (&["ClassNamedLikeTypeParameter"], shadow::class_named_like_type_parameter),
    (&["TypeParameterShadowing"], shadow::type_parameter_shadowing),
    (&["StaticQualifiedUsingExpression"], statics::static_qualified_using_expression),
    (&["UnnecessaryCheckNotNull"], nullcheck::unnecessary_check_not_null),
    (&["DoNotCall"], donot::do_not_call_method),
    (&["DoNotCall"], donot::do_not_call_use),
    (&["TimeUnitMismatch"], timeunit::time_unit_mismatch),
    (&["AvoidValueSetter"], protosetter::avoid_value_setter),
    (&["ImpossibleNullComparison"], nullcompare::impossible_null_comparison),
    (&["NullAway"], nullaway::null_away),
    (&["BanClassLoader"], ban::ban_class_loader),
    (&["BanJNDI"], ban::ban_jndi),
    (&["SystemExitOutsideMain"], ban::system_exit_outside_main),
    (&["ExtendsObject"], ban::extends_object),
    (&["Finally"], finally_block::finally),
    (&["CompareToZero"], compare_zero::compare_to_zero),
    (&["SynchronizeOnNonFinalField"], locking::synchronize_on_non_final_field),
    (&["LockNotBeforeTry"], locking::lock_not_before_try),
    (&["DepAnn"], depann::dep_ann),
    (&["FloatingPointLiteralPrecision"], literals::floating_point_literal_precision),
    (&["StaticAssignmentOfThrowable"], constants::static_assignment_of_throwable),
    (&["ModifyCollectionInEnhancedForLoop"], collections::modify_collection_in_enhanced_for_loop),
    (&["SelfAssignment"], self_assignment::self_assignment),
    (&["UnnecessarilyUsedValue"], ignorable::unnecessarily_used_value),
    (&["StreamResourceLeak"], streams::stream_resource_leak),
    (&["ByteBufferBackingArray"], buffers::byte_buffer_backing_array),
    (&["ClassNewInstance"], reflection::class_new_instance),
    (&["ParameterComment"], parameter_comment::parameter_comment),
    (&["StringConcatToTextBlock"], text_blocks::string_concat_to_text_block),
    (&["UnnecessaryMethodReference"], references::unnecessary_method_reference),
    (&["AmbiguousMethodReference"], references::ambiguous_method_reference),
    (&["NegativeBoolean"], lexical::negative_boolean),
    (&["NegativeBoolean"], lexical::negative_boolean_for_each),
    (&["ShortCircuitBoolean"], lexical::short_circuit_boolean),
    (&["RedundantControlFlow"], lexical::redundant_control_flow),
    (&["LoopOverCharArray"], lexical::loop_over_char_array),
    (&["HidingField"], types::hiding_field),
    (&["AvoidCommonTypeNames"], types::avoid_common_type_names),
    (&["UnnecessaryLongToIntConversion"], types::unnecessary_long_to_int),
    (&["LiteByteStringUtf8"], types::lite_byte_string_utf8),
    (&["URLEqualsHashCode"], types::url_equals_hash_code),
    (&["UnusedTypeParameter"], types::unused_type_parameter),
    (&["StringCharset"], strings::string_charset),
    (&["FunctionalInterfaceClash"], clash::functional_interface_clash),
    (&["NonCanonicalType"], canonical::non_canonical_type),
    (&["DefaultCharset"], default_charset::default_charset),
    (&["UnnecessaryStringBuilder"], builders::unnecessary_string_builder),
    (&["UnsynchronizedOverridesSynchronized"], sync::unsynchronized_overrides_synchronized),
    (&["UndefinedEquals"], strings::undefined_equals),
    (&["DoubleBraceInitialization"], built_collections::double_brace_initialization),
    (&["UnsafeLocaleUsage"], unsafe_calls::unsafe_locale_usage),
    (&["BanSerializableRead"], unsafe_calls::ban_serializable_read),
    (&["Interruption"], unsafe_calls::interruption),
    (&["IdentityHashMapUsage"], unsafe_calls::identity_hash_map_usage),
    (&["LongDoubleConversion"], numeric::long_double_conversion),
    (&["NarrowCalculation"], numeric::narrow_calculation),
    (&["BoxedPrimitiveEquality"], equality::boxed_primitive_equality),
    (&["ExplicitArrayForVarargs"], varargs::explicit_array_for_varargs),
    (&["BoxingComparator"], varargs::boxing_comparator),
    (&["MixedArrayDimensions"], arrays::mixed_array_dimensions),
    (&["MutablePublicArray"], arrays::mutable_public_array),
    (&["UnnecessaryStaticImport"], imports::unnecessary_static_import),
    (&["BadImport"], imports::bad_import),
    (&["TypeParameterQualifier"], classes3::type_parameter_qualifier),
    (&["OverrideThrowableToString"], classes3::override_throwable_to_string),
    (&["TryWithResourcesVariable"], classes3::try_with_resources_variable),
    (&["NonAtomicVolatileUpdate"], classes3::non_atomic_volatile_update),
    (&["ClassCanBeStatic"], classes3::class_can_be_static),
    (&["InconsistentCapitalization"], capital::inconsistent_capitalization),
    (&["MissingCasesInEnumSwitch"], switches::missing_cases_in_enum_switch),
    (&["EqualsIncompatibleType"], equalsincompat::equals_incompatible_type),
    (&["ClassInitializationDeadlock"], deadlock::class_initialization_deadlock),
    (&["CatchAndPrintStackTrace"], catching::catch_and_print_stack_trace),
    (&["InterruptedInCatchBlock"], catching::interrupted_in_catch_block),
    (&["LabelledBreakTarget"], catching::labelled_break_target),
    (&["Finalize"], catching::finalize),
    (&["ArgumentSelectionDefectChecker"], argsel::argument_selection_defect),
    (&["FloatCast"], casts::float_cast),
    (&["UnsafeReflectiveConstructionCast"], casts::unsafe_reflective_construction_cast),
    (&["ArrayToString"], array_values::array_to_string),
    (&["ArrayHashCode"], array_values::array_hash_code),
    (&["EqualsNull"], misc_calls::equals_null),
    (&["GetClassOnClass"], misc_calls::get_class_on_class),
    (&["HashtableContains"], misc_calls::hashtable_contains),
    (&["UnnecessaryTypeArgument"], misc_calls::unnecessary_type_argument),
    (&["DuplicateBranches"], branches::duplicate_branches),
    (&["IdentityBinaryExpression"], branches::identity_binary_expression),
    (&["ComparisonContractViolated"], contracts::comparison_contract_violated),
    (&["DistinctVarargsChecker"], contracts::distinct_varargs),
    (&["UnnecessaryOptionalGet"], contracts::unnecessary_optional_get),
    (&["CollectionUndefinedEquality"], undefined_equality::collection_undefined_equality),
    (&["UnnecessaryAsync"], unnecessary_async::unnecessary_async),
    (&["ReturnFromVoid"], return_from_void::return_from_void),
    (&["UnnecessaryAnonymousClass"], anonymous_class::unnecessary_anonymous_class),
    (&["ModifiedButNotUsed"], modified_unused::modified_but_not_used),
    (&["IntLiteralCast"], decl_checks::int_literal_cast),
    (&["PublicApiNamedStreamShouldReturnStream"], decl_checks::public_api_named_stream),
    (&["StaticAssignmentInConstructor"], decl_checks::static_assignment_in_constructor),
    (&["EqualsUnsafeCast"], decl_checks::equals_unsafe_cast),
    (&["TimeUnitConversionChecker"], time_checks::time_unit_conversion),
    (&["JavaTimeDefaultTimeZone"], time_checks::java_time_default_time_zone),
    (&["JavaDurationGetSecondsGetNano"], time_checks::duration_get_seconds_get_nano),
    (&["JavaDurationGetSecondsToToSeconds"], time_checks::duration_get_seconds_to_seconds),
    (&["ObjectToString"], object_to_string::object_to_string),
    (&["ConstantPatternCompile"], constant_pattern::constant_pattern_compile),
    (&["ReturnValueIgnored"], returns_ignored::return_value_ignored),
];

/// Checks that look at a whole file. They run after the walk: a call they work out ahead of the checks above would
/// leave the resolver with answers found in a different order.
const FILE_CHECKS: &[(&[&str], Check)] = &[
    (&["UnnecessaryBoxedVariable"], boxed::unnecessary_boxed_variable),
    (&["UnusedMethod"], unused_methods::unused_method),
    (&["NotJavadoc"], docplaced::not_javadoc),
    (&["AlmostJavadoc"], docplaced::almost_javadoc),
    (&["InlineTrivialConstant"], constants::inline_trivial_constant),
    (&["StronglyTypeTime"], strong_time::strongly_type_time),
    (&["UnicodeEscape"], lexical::unicode_escape),
    (&["MultipleTopLevelClasses"], lexical::multiple_top_level_classes),
    (&["DeduplicateConstants"], dedupe::deduplicate_constants),
    (&["FieldCanBeLocal"], fieldlocal::field_can_be_local),
    (&["UnusedNestedClass"], unused_nested::unused_nested_class),
    (&["AlreadyChecked"], already_checked::already_checked),
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
