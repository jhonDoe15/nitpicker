//! Error Prone checks written for the engine: same check name, line and column as Error Prone reports.
mod collection_types;
mod compiled;
mod doc;
mod javac_print;
mod formatter;
mod regex;
mod temporal_fields;
mod jdk_parse;
mod jdk_values;
mod always_throws;
mod sun_api;
mod record_components;
mod modify_source;
mod type_shadowing;
mod use_binds;
mod fix_compiles;
mod assert_throws_fix;
mod assert_throws_minimizer;
mod assert_throws_types;
mod missing_fail;
mod missing_fail_parts;
mod truth_expected;
mod fix_compiles_writes;
mod inline_me;
mod format_validation;
mod format_string;
mod format_annotation;
mod float_epsilon;
mod docparse;
mod docref;
pub mod fixes;
mod annotated;
mod ban;
mod comments;
mod parameter_comment;
mod parameter_name;
mod identifier_data;
mod text_blocks;
mod truth_implement_chaining;
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
mod lambda_function_types;
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
pub(crate) mod tokens;
mod positions;
mod testcode;
mod arrays;
mod array_values;
mod misc_calls;
mod branches;
mod contracts;
mod time_checks;
mod time_with;
mod inject_more;
mod junit_more;
mod misc_defect_shapes;
mod hash_code_checks;
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
mod mirror_to_string;
mod object_to_string;
mod constant_pattern;
mod already_checked;
mod already_pure;
mod ignored_matchers;
mod returns_ignored;
mod odd_calls;
mod flogger;
mod odd_types;
mod time_from;
mod guice;
mod junit_init;
mod junit_tests;
mod recursion;
mod equals_wrong;
mod inject_checks;
mod date_format;
mod call_defects;
mod collection_self;
mod source_defects;
mod nullable_outer;
mod cirv_classes;
mod array_calls;
mod do_not_mock;
mod binary_misc;
mod null_branch;
mod async_nulls;
mod duration_units;
mod class_names;
mod constructor_chain;
mod auto_value_order;
mod annotation_args;
mod annotation_defects;
mod java_quote;
mod junit_runners;
mod misc12;
mod optional_checks;
mod period_checks;
mod proto_checks;
mod random_checks;
mod self_checks;
mod symbol_key;
mod stmt_defects;
mod junit_asserts;
mod const_checks;
pub(crate) mod java_text;
mod call_consts;
mod auto_value;
mod tz_data;
mod zone_ids;
mod time_constants;
mod visitor_state;
mod framework_methods;
mod big_decimal;
mod duration_calls;
mod outline_none;
mod flogger_format;
mod jdk_calls;
mod labels;
mod constant_exprs;
mod incompatible_calls;
mod junit3;
mod override_checks;
mod annotation_impl;
mod split_logging;
mod conditional_promotion;
mod compile_constant;
mod descriptor_mixup;
mod builder_defaults;
mod android_injection;
mod terminating_call;
mod owners;
mod size_join;
mod null_varargs;
mod boxed_lock;
mod self_assertion;
mod proto_builders;
mod proto_build_ignored;
mod inject_codegen;
mod source_text;
mod annotation_misuse;
mod tree_to_string;
mod joda_checks;
mod numeric_calls;
mod contextual_misc;
mod nested_instanceof;
mod optional_nulls;
mod mockito_setup;
mod mock_unused;
mod misc_defect_calls;
mod declaration_defects;
mod auto_value_fields;
mod flogger_calls;
mod assert_order;
mod mock_invocations;
mod boxed_constructor;
mod catch_fail;
mod robolectric_shadow;
mod test_parameter;
mod truth_exactly;
mod flogger_modifiers;
mod truth_types;
mod tree_kind_checks;
mod inject_method_annotations;
mod strong_byte_string;
mod self_and_stream_calls;
mod call_arguments;
mod declaration_warnings;
mod future_transform;
mod class_declaration_checks;
mod method_call_checks;
mod thread_time_checks;
mod flogger_causes;
mod android_fragments;
mod rule_not_run;
mod unnecessary_copy;
mod unnecessary_qualifier;
mod matcher_wrapping;
mod junit_cleanups;
mod dagger_modules;
mod list_remove;
mod package_location;
mod null_pointer_tester;
mod guarded_writes;
mod guarded_by;
mod immutable_set_contains;
mod framework_assignments;
mod ignored_values;
mod constant_expression_checks;
mod provides_checks;
mod comparable_checks;
mod date_format_constant;
mod format_checks;
mod doc_misc;
mod truth_chaining;
mod bug_pattern_naming;
mod expected_exception;
mod auto_value_leaks;
mod assertion_failures;
mod assert_throws;
mod truth_checks;
mod three_letter_zones;
mod wakelock;
mod may_report;
mod restricted;
mod reach;
mod reach_checks;
mod oneof;
mod idents;
mod idents_found;
mod pattern_instanceof;
mod nullness_declared;
mod nullness_placement;
mod flogger_args;
mod no_allocation;
mod must_be_closed;
mod must_be_closed_fix;
mod processor_audit;
mod lombok_rewrites;

use super::types::project::JavaProject;
use super::types::scope::{FileScope, Resolver};
use crate::engine::source::{ParentTable, SourceFile, children, parent, walk};
use crate::engine::{FileRule, Project, finding::Finding};
use tree_sitter::Node;

/// What a check gets: the file, its types and a place to report.
pub struct Context<'a> {
    pub resolver: &'a Resolver<'a>,
    /// The run's classes; with Lombok and the build's class directories, their class files too.
    pub project: &'a JavaProject,
    pub file: &'a SourceFile,
    line_starts: Vec<usize>,
    selected: Option<Vec<String>>,
    out: std::cell::RefCell<Vec<Finding>>,
    /// The checks that leave this file to Error Prone: the engine cannot tell what they report here.
    handed: std::cell::RefCell<Vec<&'static str>>,
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
    /// Leaves the check in this file to Error Prone, unless a `@SuppressWarnings` around the node turns it off there.
    pub fn hand_back(&self, check: &'static str, node: Node) {
        if self.suppressed(check, node) || self.skipped(check) || self.selected.as_ref().is_some_and(|names| !names.iter().any(|name| name == check)) {
            return;
        }
        let mut handed = self.handed.borrow_mut();
        if !handed.contains(&check) {
            handed.push(check);
        }
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
        if self.selected.as_ref().is_some_and(|names| !names.iter().any(|name| name == check)) || self.skipped(check) {
            return;
        }
        let (line, column) = self.line_column(offset);
        self.out.borrow_mut().push(Finding {
            file: self.file.path.clone(),
            line,
            column,
            rule: check.to_string(),
            message: format!("[{check}] {message}"),
            symbol: None,
            priority: None,
            arguments: CLASS_EXEMPTED
                .contains(&check)
                .then(|| self.class_annotations(offset))
                .filter(|names| !names.is_empty()),
        });
    }
    /// The annotations of the classes around an offset, innermost class first, each followed by the annotations on its
    /// own declaration, the way Error Prone's runner lists them: full names, without `java.lang.annotation`.
    fn class_annotations(&self, offset: usize) -> Vec<String> {
        let mut names = Vec::new();
        let mut current = self.file.tree.root_node().descendant_for_byte_range(offset, offset);
        while let Some(node) = current {
            if CLASS_KINDS.contains(&node.kind()) {
                self.add_annotations(self.resolver.annotation_names(node), &mut names);
            }
            current = node.parent();
        }
        names
    }
    fn add_annotations(&self, found: Vec<String>, names: &mut Vec<String>) {
        for name in found {
            if name.starts_with("java.lang.annotation.") || names.contains(&name) {
                continue;
            }
            names.push(name.clone());
            let above = self.resolver.index.get(&name).map(|info| info.class_annotations.clone()).unwrap_or_default();
            self.add_annotations(above, names);
        }
    }
    /// Whether the run compiles test-only code: Error Prone's `-XepCompilingTestOnlyCode`.
    pub fn test_only(&self) -> bool {
        self.resolver.index.test_only
    }
    fn skipped(&self, check: &str) -> bool {
        self.test_only() && NOT_ON_TEST_ONLY.contains(&check)
    }
    /// Whether the node or a declaration around it carries `@SuppressWarnings` with the check's name or "all".
    pub fn suppressed(&self, check: &str, node: Node) -> bool {
        let mut current = Some(node);
        while let Some(at) = current {
            if DECLARATIONS.contains(&at.kind()) && self.suppress_strings(at).iter().any(|name| name == check || name == "all" || ALT_NAMES.contains(&(check, name.as_str()))) {
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
    /// javac's line and column of a byte offset, from one: UTF-16 units, a tab moves to the next multiple of eight.
    pub fn line_column(&self, offset: usize) -> (usize, usize) {
        let line = self.line_of(offset);
        let mut column = 0usize;
        for character in self.file.text[self.line_starts[line]..offset].chars() {
            column = if character == '\t' { column / 8 * 8 + 8 } else { column + character.len_utf16() };
        }
        (line + 1, column + 1)
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
    (&["PeriodTimeMath"], incompatible_calls::period_time_math),
    (&["ArrayFillIncompatibleType"], incompatible_calls::array_fill_incompatible_type),
    (&["IsInstanceOfClass"], incompatible_calls::is_instance_of_class),
    (&["FuturesGetCheckedIllegalExceptionType"], incompatible_calls::futures_get_checked_illegal_exception_type),
    (&["JUnit3TestNotRun"], junit3::junit3_test_not_run),
    (&["DeadException"], junit3::dead_exception),
    (&["ForOverride"], override_checks::for_override_invocation),
    (&["ForOverride"], override_checks::for_override_method),
    (&["MissingSuperCall"], override_checks::missing_super_call_annotation),
    (&["MissingSuperCall"], override_checks::missing_super_call_method),
    (&["FunctionalInterfaceMethodChanged"], override_checks::functional_interface_method_changed),
    (&["BadAnnotationImplementation"], annotation_impl::bad_annotation_implementation),
    (&["FloggerSplitLogStatement"], split_logging::flogger_split_log_statement),
    (&["ConditionalExpressionNumericPromotion"], conditional_promotion::conditional_expression_numeric_promotion),
    (&["MixedDescriptors"], descriptor_mixup::mixed_descriptors),
    (&["AutoValueBuilderDefaultsInConstructor"], builder_defaults::auto_value_builder_defaults_in_constructor),
    (&["AndroidInjectionBeforeSuper"], android_injection::android_injection_before_super),
    (&["MissingTestCall"], terminating_call::missing_test_call),
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
    (&["EmptyBlockTag", "MissingSummary", "InvalidBlockTag", "UnescapedEntity", "EscapedEntity", "InvalidInlineTag", "InvalidThrows", "InvalidParam", "InvalidLink", "MalformedInlineTag", "PreferThrowsTag", "InvalidSnippet", "InvalidThrowsLink", "UnrecognisedJavadocTag", "UrlInSee", "InheritDoc"], javadoc::javadoc),
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
    (&["ImmutableAnnotationChecker"], immutable::entry::immutable_annotation_checker),
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
    (&["ParameterName"], parameter_name::parameter_name),
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
    (&["FallThrough"], reach_checks::fall_through),
    (&["MissingDefault"], reach_checks::missing_default),
    (&["SwitchDefault"], reach_checks::switch_default),
    (&["ReachabilityFenceUsage"], reach_checks::reachability_fence_usage),
    (&["WrongOneof"], oneof::wrong_oneof),
    (&["PatternMatchingInstanceof"], pattern_instanceof::pattern_matching_instanceof),
    (&["MultipleNullnessAnnotations", "NullablePrimitive", "NullableWildcard"], nullness_placement::annotated_type_checks),
    (&["MultipleNullnessAnnotations", "NullablePrimitive", "NullablePrimitiveArray", "NullableVoid"], nullness_declared::declaration_checks),
    (&["NullableTypeParameter"], nullness_placement::nullable_type_parameter),
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
    (&["StreamToString"], object_to_string::stream_to_string),
    (&["LiteProtoToString"], object_to_string::lite_proto_to_string),
    (&["ImplementAssertionWithChaining"], truth_implement_chaining::implement_assertion_with_chaining),
    (&["LambdaFunctionalInterface"], lambda_function_types::lambda_functional_interface),
    (&["UnnecessaryQualifier"], unnecessary_qualifier::unnecessary_qualifier),
    (&["TruthIncompatibleType"], truth_types::truth_incompatible_type),
    (&["SymbolToString"], object_to_string::symbol_to_string),
    (&["TypeToString"], object_to_string::type_to_string),
    (&["CompileTimeConstant"], compile_constant::compile_time_constant_check),
    (&["ConstantPatternCompile"], constant_pattern::constant_pattern_compile),
    (&["ReturnValueIgnored"], returns_ignored::return_value_ignored),
    (&["FuzzyEqualsShouldNotBeUsedInEqualsMethod"], odd_calls::fuzzy_equals_in_equals),
    (&["GetClassOnAnnotation"], odd_calls::get_class_on_annotation),
    (&["IndexOfChar"], odd_calls::index_of_char),
    (&["InexactVarargsConditional"], odd_calls::inexact_varargs_conditional),
    (&["IdentityHashMapBoxing"], odd_calls::identity_hash_map_boxing),
    (&["FloggerLogString"], flogger::flogger_log_string),
    (&["IsInstanceIncompatibleType"], odd_types::is_instance_incompatible_type),
    (&["Incomparable"], odd_types::incomparable),
    (&["IterablePathParameter"], odd_types::iterable_path_parameter),
    (&["FromTemporalAccessor"], time_from::from_temporal_accessor),
    (&["InstantTemporalUnit"], time_from::instant_temporal_unit),
    (&["GuiceAssistedInjectScoping"], guice::assisted_inject_scoping),
    (&["GuiceAssistedParameters"], guice::assisted_parameters),
    (&["GuiceInjectOnFinalField"], guice::inject_on_final_field),
    (&["InjectMoreThanOneScopeAnnotationOnClass"], guice::more_than_one_scope_annotation),
    (&["InjectOnMemberAndConstructor"], guice::inject_on_member_and_constructor),
    (&["IncompatibleModifiers"], guice::incompatible_modifiers),
    (&["RequiredModifiers"], guice::required_modifiers),
    (&["RestrictedApi"], restricted::restricted_api),
    (&["CollectionIncompatibleType"], collection_types::collection_incompatible_type),
    (&["JUnit4SetUpNotRun"], junit_init::set_up_not_run),
    (&["JUnit4TearDownNotRun"], junit_init::tear_down_not_run),
    (&["JUnit4ClassAnnotationNonStatic"], junit_init::class_annotation_non_static),
    (&["JUnit4TestNotRun"], junit_tests::junit4_test_not_run),
    (&["InfiniteRecursion"], recursion::infinite_recursion),
    (&["EqualsWrongThing"], equals_wrong::equals_wrong_thing),
    (&["JavaxInjectOnAbstractMethod"], inject_checks::javax_inject_on_abstract_method),
    (&["MisplacedScopeAnnotations"], inject_checks::misplaced_scope_annotations),
    (&["MissingRuntimeRetention"], inject_checks::missing_runtime_retention),
    (&["MoreThanOneInjectableConstructor"], inject_checks::more_than_one_injectable_constructor),
    (&["MoreThanOneQualifier"], inject_checks::more_than_one_qualifier),
    (&["MisusedDayOfYear"], date_format::misused_day_of_year),
    (&["MisusedWeekYear"], date_format::misused_week_year),
    (&["JodaToSelf"], date_format::joda_to_self),
    (&["LocalDateTemporalAmount"], date_format::local_date_temporal_amount),
    (&["JUnitAssertSameCheck"], call_defects::junit_assert_same),
    (&["LossyPrimitiveCompare"], call_defects::lossy_primitive_compare),
    (&["MathRoundIntLong"], call_defects::math_round_int_long),
    (&["MisleadingEmptyVarargs"], call_defects::misleading_empty_varargs),
    (&["MockitoUsage"], call_defects::mockito_usage),
    (&["NCopiesOfChar"], call_defects::n_copies_of_char),
    (&["NonRuntimeAnnotation"], call_defects::non_runtime_annotation),
    (&["ModifyingCollectionWithItself"], collection_self::modifying_collection_with_itself),
    (&["LongLiteralLowerCaseSuffix"], source_defects::long_literal_lower_case_suffix),
    (&["LoopConditionChecker"], source_defects::loop_condition_checker),
    (&["NullTernary"], source_defects::null_ternary),
    (&["NonFinalCompileTimeConstant"], source_defects::non_final_compile_time_constant),
    (&["NonCanonicalStaticImport"], source_defects::non_canonical_static_import),
    (&["NullableOnContainingClass"], nullable_outer::nullable_on_containing_class),
    (&["NoCanIgnoreReturnValueOnClasses"], cirv_classes::no_can_ignore_return_value_on_classes),
    (&["ArrayEquals"], array_calls::array_equals),
    (&["ArraysAsListPrimitiveArray"], array_calls::arrays_as_list_primitive_array),
    (&["CollectionToArraySafeParameter"], array_calls::collection_to_array_safe_parameter),
    (&["BadShiftAmount"], binary_misc::bad_shift_amount),
    (&["ComparingThisWithNull"], binary_misc::comparing_this_with_null),
    (&["EqualsNaN"], binary_misc::equals_nan),
    (&["DiscardedPostfixExpression"], binary_misc::discarded_postfix_expression),
    (&["DeadThread"], binary_misc::dead_thread),
    (&["EqualsReference"], binary_misc::equals_reference),
    (&["DereferenceWithNullBranch"], null_branch::dereference_with_null_branch),
    (&["AsyncFunctionReturnsNull"], async_nulls::async_function_returns_null),
    (&["AsyncCallableReturnsNull"], async_nulls::async_callable_returns_null),
    (&["DaggerProvidesNull"], async_nulls::dagger_provides_null),
    (&["DangerousLiteralNull"], async_nulls::dangerous_literal_null),
    (&["DurationFrom"], duration_units::duration_from),
    (&["DurationGetTemporalUnit"], duration_units::duration_get_temporal_unit),
    (&["DurationTemporalUnit"], duration_units::duration_temporal_unit),
    (&["DurationToLongTimeUnit"], duration_units::duration_to_long_time_unit),
    (&["ComparableType"], class_names::comparable_type),
    (&["AutoFactoryAtInject"], class_names::auto_factory_at_inject),
    (&["ChainingConstructorIgnoresParameter"], constructor_chain::chaining_constructor_ignores_parameter),
    (&["DoNotMock"], do_not_mock::do_not_mock),
    (&["CheckNotNullMultipleTimes"], constructor_chain::check_not_null_multiple_times),
    (&["AutoValueConstructorOrderChecker"], auto_value_order::auto_value_constructor_order),
    (&["OptionalMapUnusedValue"], optional_checks::optional_map_unused_value),
    (&["OptionalOfRedundantMethod"], optional_checks::optional_of_redundant_method),
    (&["OverlappingQualifierAndScopeAnnotation"], annotation_defects::overlapping_qualifier_and_scope_annotation),
    (&["ParametersButNotParameterized"], junit_runners::parameters_but_not_parameterized),
    (&["PeriodFrom"], period_checks::period_from),
    (&["PeriodGetTemporalUnit"], period_checks::period_get_temporal_unit),
    (&["PrivateSecurityContractProtoAccess"], proto_checks::private_security_contract_proto_access),
    (&["ProtoStringFieldReferenceEquality"], proto_checks::proto_string_field_reference_equality),
    (&["ProtocolBufferOrdinal"], proto_checks::protocol_buffer_ordinal),
    (&["ProvidesMethodOutsideOfModule"], annotation_defects::provides_method_outside_of_module),
    (&["RandomCast"], random_checks::random_cast),
    (&["RandomModInteger"], random_checks::random_mod_integer),
    (&["RecordAccessorInCompactConstructor"], misc12::record_accessor_in_compact_constructor),
    (&["SelfAssertion"], self_assertion::self_assertion),
    (&["SelfComparison"], self_checks::self_comparison),
    (&["SelfEquals"], self_checks::self_equals),
    (&["ShouldHaveEvenArgs"], misc12::should_have_even_args),
    (&["StringBuilderInitWithChar"], random_checks::string_builder_init_with_char),
    (&["SuppressWarningsDeprecated"], annotation_defects::suppress_warnings_deprecated),
    (&["TestExceptionChecker"], junit_runners::test_exception_checker),
    (&["TestParametersNotInitialized"], junit_runners::test_parameters_not_initialized),
    (&["ThrowNull"], stmt_defects::throw_null),
    (&["VarTypeName"], stmt_defects::var_type_name),
    (&["UnusedAnonymousClass"], stmt_defects::unused_anonymous_class),
    (&["UnusedCollectionModifiedInPlace"], stmt_defects::unused_collection_modified_in_place),
    (&["TheoryButNoTheories"], junit_asserts::theory_but_no_theories),
    (&["JUnitParameterMethodNotFound"], junit_asserts::junit_parameter_method_not_found),
    (&["TryFailThrowable"], junit_asserts::try_fail_throwable),
    (&["UseCorrectAssertInTests"], junit_asserts::use_correct_assert_in_tests),
    (&["ComparisonOutOfRange"], const_checks::comparison_out_of_range),
    (&["ConstantOverflow"], const_checks::constant_overflow),
    (&["XorPower"], const_checks::xor_power),
    (&["DuplicateMapKeys"], call_consts::duplicate_map_keys),
    (&["InsecureCryptoUsage"], call_consts::insecure_crypto_usage),
    (&["SubstringOfZero"], call_consts::substring_of_zero),
    (&["ThreadBuilderNameWithPlaceholder"], call_consts::thread_builder_name_with_placeholder),
    (&["FloggerLogVarargs"], call_consts::flogger_log_varargs),
    (&["ZoneIdOfZ"], call_consts::zone_id_of_z),
    (&["LenientFormatStringValidation"], call_consts::lenient_format_string_validation),
    (&["ExtendsAutoValue"], auto_value::extends_auto_value),
    (&["InvalidTimeZoneID"], time_constants::invalid_time_zone_id),
    (&["InvalidZoneId"], time_constants::invalid_zone_id),
    (&["InvalidJavaTimeConstant"], time_constants::invalid_java_time_constant),
    (&["AlwaysThrows"], always_throws::always_throws),
    (&["StaticMockMember"], fix_compiles::static_mock_member),
    (&["MissingFail"], missing_fail::missing_fail),
    (&["TryFailRefactoring"], assert_throws_fix::try_fail_refactoring),
    (&["AssertThrowsMinimizer"], assert_throws_minimizer::assert_throws_minimizer),
    (&["TruthAssertExpected"], truth_expected::truth_assert_expected),
    (&["MutableGuiceModule"], fix_compiles::mutable_guice_module),
    (&["NewFileSystem"], always_throws::new_file_system),
    (&["StringJoin"], size_join::string_join),
    (&["SizeGreaterThanOrEqualsZero"], size_join::size_greater_than_or_equals_zero),
    (&["ThrowIfUncheckedKnownChecked"], size_join::throw_if_unchecked_known_checked),
    (&["PreconditionsInvalidPlaceholder"], size_join::preconditions_invalid_placeholder),
    (&["NullNeedsCastForVarargs"], null_varargs::null_needs_cast_for_varargs),
    (&["LockOnBoxedPrimitive"], boxed_lock::lock_on_boxed_primitive),
    (&["ProtoTruthMixedDescriptors"], proto_builders::proto_truth_mixed_descriptors),
    (&["SetUnrecognized"], proto_builders::set_unrecognized),
    (&["RedundantSetterCall"], proto_builders::redundant_setter_call),
    (&["ProtoBuilderReturnValueIgnored"], proto_build_ignored::proto_builder_return_value_ignored),
    (&["OverridesJavaxInjectableMethod"], inject_codegen::overrides_javax_injectable_method),
    (&["RefersToDaggerCodegen"], inject_codegen::refers_to_dagger_codegen),
    (&["MisleadingEscapedSpace"], source_text::misleading_escaped_space),
    (&["CompatibleWithAnnotationMisuse"], annotation_misuse::compatible_with_misuse),
    (&["JavaDurationWithNanos"], time_with::java_duration_with_nanos),
    (&["JavaDurationWithSeconds"], time_with::java_duration_with_seconds),
    (&["JodaDurationWithMillis"], time_with::joda_duration_with_millis),
    (&["JavaInstantGetSecondsGetNano"], time_with::java_instant_get_seconds_get_nano),
    (&["JavaLocalDateTimeGetNano"], time_with::java_local_date_time_get_nano),
    (&["JavaLocalTimeGetNano"], time_with::java_local_time_get_nano),
    (&["JavaPeriodGetDays"], time_with::java_period_get_days),
    (&["JodaConstructors"], time_with::joda_constructors),
    (&["JodaDateTimeConstants"], time_with::joda_date_time_constants),
    (&["JavaxInjectOnFinalField"], inject_more::javax_inject_on_final_field),
    (&["InjectOnConstructorOfAbstractClass"], inject_more::inject_on_constructor_of_abstract_class),
    (&["InjectedConstructorAnnotations"], inject_more::injected_constructor_annotations),
    (&["InjectScopeAnnotationOnInterfaceOrAbstractClass"], inject_more::scope_annotation_on_interface_or_abstract_class),
    (&["InjectInvalidTargetingOnScopingAnnotation"], inject_more::invalid_targeting_on_scoping_annotation),
    (&["JUnit3FloatingPointComparisonWithoutDelta"], junit_more::junit3_floating_point_comparison_without_delta),
    (&["JUnit4ClassUsedInJUnit3"], junit_more::junit4_class_used_in_junit3),
    (&["JUnitAmbiguousTestClass"], junit_more::junit_ambiguous_test_class),
    (&["JUnitIncompatibleType"], junit_more::junit_incompatible_type),
    (&["HardCodedSdCardPath"], misc_defect_shapes::hard_coded_sd_card_path),
    (&["ICCProfileGetInstance"], misc_defect_shapes::icc_profile_get_instance),
    (&["IncorrectMainMethod"], misc_defect_shapes::incorrect_main_method),
    (&["IncrementInForLoopAndHeader"], misc_defect_shapes::increment_in_for_loop_and_header),
    (&["InstanceOfAndCastMatchWrongType"], misc_defect_shapes::instance_of_and_cast_match_wrong_type),
    (&["IntFloatConversion"], misc_defect_shapes::int_float_conversion),
    (&["InconsistentHashCode"], hash_code_checks::inconsistent_hash_code),
    (&["JodaInstantWithMillis"], joda_checks::joda_instant_with_millis),
    (&["JodaNewPeriod"], joda_checks::joda_new_period),
    (&["JodaPlusMinusLong"], joda_checks::joda_plus_minus_long),
    (&["JodaTimeConverterManager"], joda_checks::joda_time_converter_manager),
    (&["LongFloatConversion"], numeric_calls::long_float_conversion),
    (&["MathAbsoluteNegative"], numeric_calls::math_absolute_negative),
    (&["MultipleUnaryOperatorsInMethodCall"], numeric_calls::multiple_unary_operators_in_method_call),
    (&["NegativeCharLiteral"], numeric_calls::negative_char_literal),
    (&["LockOnNonEnclosingClassLiteral"], contextual_misc::lock_on_non_enclosing_class_literal),
    (&["MissingRefasterAnnotation"], contextual_misc::missing_refaster_annotation),
    (&["MultimapKeys"], contextual_misc::multimap_keys),
    (&["MultipleParallelOrSequentialCalls"], contextual_misc::multiple_parallel_or_sequential_calls),
    (&["NamedLikeContextualKeyword"], contextual_misc::named_like_contextual_keyword),
    (&["LiteEnumValueOf"], contextual_misc::lite_enum_value_of),
    (&["NestedInstanceOfConditions"], nested_instanceof::nested_instance_of_conditions),
    (&["NonCanonicalStaticMemberImport"], nested_instanceof::non_canonical_static_member_import),
    (&["NullOptional"], optional_nulls::null_optional),
    (&["NullableOptional"], optional_nulls::nullable_optional),
    (&["NullableConstructor"], optional_nulls::nullable_constructor),
    (&["OptionalMapToOptional"], optional_nulls::optional_map_to_optional),
    (&["MockIllegalThrows"], mockito_setup::mock_illegal_throws),
    (&["MockitoDoSetup"], mockito_setup::mockito_do_setup),
    (&["CacheLoaderNull"], async_nulls::cache_loader_null),
    (&["DoNotMockAutoValue"], do_not_mock::do_not_mock_auto_value),
    (&["BareDotMetacharacter"], misc_defect_calls::bare_dot_metacharacter),
    (&["InvalidPatternSyntax"], misc_defect_calls::invalid_pattern_syntax),
    (&["TemporalAccessorGetChronoField"], temporal_fields::temporal_accessor_get_chrono_field),
    (&["SunApi"], sun_api::sun_api),
    (&["RecordComponentAccessorAnnotationConflict"], record_components::record_component_accessor_annotation_conflict),
    (&["ModifySourceCollectionInStream"], modify_source::modify_source_collection_in_stream),
    (&["TypeNameShadowing"], type_shadowing::type_name_shadowing),
    (&["UseBinds"], use_binds::use_binds),
    (&["InlineMeValidator"], inline_me::inline_me_validator),
    (&["CharacterGetNumericValue"], misc_defect_calls::character_get_numeric_value),
    (&["GetClassOnEnum"], misc_defect_calls::get_class_on_enum),
    (&["BigDecimalEquals"], misc_defect_calls::big_decimal_equals),
    (&["CollectorShouldNotUseState"], misc_defect_calls::collector_should_not_use_state),
    (&["BindingToUnqualifiedCommonType"], misc_defect_calls::binding_to_unqualified_common_type),
    (&["DeprecatedVariable"], declaration_defects::deprecated_variable),
    (&["AutoValueFinalMethods"], auto_value_fields::auto_value_final_methods),
    (&["AssertSameIncompatible"], assert_order::assert_same_incompatible),
    (&["BoxedPrimitiveConstructor"], boxed_constructor::boxed_primitive_constructor),
    (&["CatchFail"], catch_fail::catch_fail),
    (&["AssertEqualsArgumentOrderChecker"], assert_order::assert_equals_argument_order),
    (&["FloggerPerWithoutRateLimit"], flogger_calls::flogger_per_without_rate_limit),
    (&["FloggerLogWithCause"], flogger_calls::flogger_log_with_cause),
    (&["FloggerRedundantIsEnabled"], flogger_calls::flogger_redundant_is_enabled),
    (&["AutoValueImmutableFields"], auto_value_fields::auto_value_immutable_fields),
    (&["ClosingStandardOutputStreams"], declaration_defects::closing_standard_output_streams),
    (&["AssistedInjectAndInjectOnConstructors"], declaration_defects::assisted_inject_and_inject_on_constructors),
    (&["AssistedInjectAndInjectOnSameConstructor"], declaration_defects::assisted_inject_and_inject_on_same_constructor),
    (&["AttemptedNegativeZero"], constant_exprs::attempted_negative_zero),
    (&["ErroneousBitwiseExpression"], constant_exprs::erroneous_bitwise_expression),
    (&["ComplexBooleanConstant"], constant_exprs::complex_boolean_constant),
    (&["NarrowingCompoundAssignment"], constant_exprs::narrowing_compound_assignment),
    (&["UnnecessaryBreakInSwitch"], labels::unnecessary_break_in_switch),
    (&["AddressSelection"], jdk_calls::address_selection),
    (&["ScannerUseDelimiter"], jdk_calls::scanner_use_delimiter),
    (&["ErroneousThreadPoolConstructorChecker"], jdk_calls::erroneous_thread_pool_constructor),
    (&["DateChecker"], jdk_calls::date_checker),
    (&["DuplicateDateFormatField"], date_format::duplicate_date_format_field),
    (&["FloggerMessageFormat"], flogger_format::flogger_message_format),
    (&["FloggerStringConcatenation"], flogger_format::flogger_string_concatenation),
    (&["OutlineNone"], outline_none::outline_none),
    (&["CanonicalDuration"], duration_calls::canonical_duration),
    (&["JodaWithDurationAddedLong"], duration_calls::joda_with_duration_added_long),
    (&["BigDecimalLiteralDouble"], big_decimal::big_decimal_literal_double),
    (&["UnnecessarilyVisible"], framework_methods::unnecessarily_visible),
    (&["DoNotClaimAnnotations"], framework_methods::do_not_claim_annotations),
    (&["UnsafeFinalization"], framework_methods::unsafe_finalization),
    (&["TraditionalSwitchExpression"], declaration_warnings::traditional_switch_expression),
    (&["TransientMisuse"], declaration_warnings::transient_misuse),
    (&["RecordComponentOverride"], declaration_warnings::record_component_override),
    (&["ToStringReturnsNull"], declaration_warnings::to_string_returns_null),
    (&["SwigMemoryLeak"], declaration_warnings::swig_memory_leak),
    (&["SystemConsoleNull"], declaration_warnings::system_console_null),
    (&["PreconditionsCheckNotNullRepeated"], call_arguments::preconditions_check_not_null_repeated),
    (&["PrimitiveArrayPassedToVarargsMethod"], call_arguments::primitive_array_passed_to_varargs_method),
    (&["PrimitiveAtomicReference"], call_arguments::primitive_atomic_reference),
    (&["ProtoDurationGetSecondsGetNano"], call_arguments::proto_duration_get_seconds_get_nano),
    (&["ProtoTimestampGetSecondsGetNano"], call_arguments::proto_timestamp_get_seconds_get_nano),
    (&["RethrowReflectiveOperationExceptionAsLinkageError"], self_and_stream_calls::rethrow_reflective_operation_exception),
    (&["SuperCallToObjectMethod"], self_and_stream_calls::super_call_to_object_method),
    (&["StreamToIterable"], self_and_stream_calls::stream_to_iterable),
    (&["SelfAlwaysReturnsThis"], self_and_stream_calls::self_always_returns_this),
    (&["QualifierOrScopeOnInjectMethod"], inject_method_annotations::qualifier_or_scope_on_inject_method),
    (&["QualifierWithTypeUse"], inject_method_annotations::qualifier_with_type_use),
    (&["PreferInstanceofOverGetKind"], tree_kind_checks::prefer_instanceof_over_get_kind),
    (&["TruthContainsExactlyElementsInUsage"], truth_exactly::truth_contains_exactly_elements_in_usage),
    (&["PreferTestParameter"], test_parameter::prefer_test_parameter),
    (&["RobolectricShadowDirectlyOn"], robolectric_shadow::robolectric_shadow_directly_on),
    (&["MissingImplementsComparable"], class_declaration_checks::missing_implements_comparable),
    (&["IterableAndIterator"], class_declaration_checks::iterable_and_iterator),
    (&["Overrides"], class_declaration_checks::overrides),
    (&["InjectOnBugCheckers"], class_declaration_checks::inject_on_bug_checkers),
    (&["OverridesGuiceInjectableMethod"], class_declaration_checks::overrides_guice_injectable_method),
    (&["OverridingMethodInconsistentArgumentNamesChecker"], class_declaration_checks::overriding_method_inconsistent_argument_names),
    (&["JUnitMethodInvoked"], method_call_checks::junit_method_invoked),
    (&["ThrowIfUncheckedKnownUnchecked"], method_call_checks::throw_if_unchecked_known_unchecked),
    (&["GuiceNestedCombine"], method_call_checks::guice_nested_combine),
    (&["TypeEquals"], method_call_checks::type_equals),
    (&["ThreadJoinLoop"], thread_time_checks::thread_join_loop),
    (&["FloggerWithoutCause"], flogger_causes::flogger_without_cause),
    (&["FloggerWithCause"], flogger_causes::flogger_with_cause),
    (&["FutureTransformAsync"], future_transform::future_transform_async),
    (&["FragmentNotInstantiable"], android_fragments::fragment_not_instantiable),
    (&["FragmentInjection"], android_fragments::fragment_injection),
    (&["UnnecessaryMethodInvocationMatcher"], matcher_wrapping::unnecessary_method_invocation_matcher),
    (&["TimeInStaticInitializer"], thread_time_checks::time_in_static_initializer),
    (&["ExtendingJUnitAssert"], junit_cleanups::extending_junit_assert),
    (&["JUnit4EmptyMethods"], junit_cleanups::junit4_empty_methods),
    (&["AssertThrowsBlockToExpression"], junit_cleanups::assert_throws_block_to_expression),
    (&["ScopeOnModule"], dagger_modules::scope_on_module),
    (&["PrivateConstructorForNoninstantiableModule"], dagger_modules::private_constructor_for_noninstantiable_module),
    (&["ListRemoveAmbiguous"], list_remove::list_remove_ambiguous),
    (&["UnnecessarySetDefault"], null_pointer_tester::unnecessary_set_default),
    (&["StaticGuardedByInstance"], guarded_writes::static_guarded_by_instance),
    (&["SelfSet"], constant_expression_checks::self_set),
    (&["TruthConstantAsserts"], constant_expression_checks::truth_constant_asserts),
    (&["DuplicateAssertion"], constant_expression_checks::duplicate_assertion),
    (&["IgnoredPureGetter"], ignored_values::ignored_pure_getter),
    (&["RxReturnValueIgnored"], ignored_values::rx_return_value_ignored),
    (&["UnnecessaryAssignment"], framework_assignments::unnecessary_assignment_expression),
    (&["UnnecessaryAssignment"], framework_assignments::unnecessary_assignment_variable),
    (&["ImmutableSetForContains"], immutable_set_contains::immutable_set_for_contains),
    (&["CloseableProvides"], provides_checks::closeable_provides),
    (&["EmptySetMultibindingContributions"], provides_checks::empty_set_multibinding_contributions),
    (&["ComparableAndComparator"], comparable_checks::comparable_and_comparator),
    (&["BadComparable"], comparable_checks::bad_comparable),
    (&["DateFormatConstant"], date_format_constant::date_format_constant),
    (&["ExpensiveLenientFormatString"], format_checks::expensive_lenient_format_string),
    (&["FormatStringShouldUsePlaceholders"], format_checks::format_string_should_use_placeholders),
    (&["FormatString"], format_string::format_string),
    (&["FloggerFormatString"], format_string::flogger_format_string),
    (&["OrphanedFormatString"], format_string::orphaned_format_string),
    (&["FormatStringAnnotation"], format_annotation::format_string_annotation),
    (&["FloatingPointAssertionWithinEpsilon"], float_epsilon::floating_point_assertion_within_epsilon),
    (&["TruthGetOrDefault"], truth_checks::truth_get_or_default),
    (&["BugPatternNaming"], bug_pattern_naming::bug_pattern_naming),
    (&["ExpectedExceptionChecker"], expected_exception::expected_exception_checker),
    (&["AutoValueSubclassLeaked"], auto_value_leaks::auto_value_subclass_leaked),
    (&["ChainedAssertionLosesContext"], truth_chaining::chained_assertion_loses_context),
    (&["AssertionFailureIgnored"], assertion_failures::assertion_failure_ignored),
    (&["AssertThrowsMultipleStatements"], assert_throws::assert_throws_multiple_statements),
    (&["ThreeLetterTimeZoneID"], three_letter_zones::three_letter_time_zone_id),
    (&["WakelockReleasedDangerously"], wakelock::wakelock_released_dangerously),
    (&["FloggerArgumentToString"], flogger_args::flogger_argument_to_string),
];

/// Checks that look at a whole file. They run after the walk: a call they work out ahead of the checks above would
/// leave the resolver with answers found in a different order.
const FILE_CHECKS: &[(&[&str], Check)] = &[
    (&["FloggerRequiredModifiers"], flogger_modifiers::flogger_required_modifiers),
    (&["StronglyTypeByteString"], strong_byte_string::strongly_type_byte_string),
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
    (&["JUnit4TestsNotRunWithinEnclosed"], junit_tests::junit4_tests_not_run_within_enclosed),
    (&["ClassName"], class_names::class_name),
    (&["PackageInfo"], misc12::package_info),
    (&["UnicodeDirectionalityCharacters"], stmt_defects::unicode_directionality_characters),
    (&["UnicodeInCode"], source_text::unicode_in_code),
    (&["TreeToString"], tree_to_string::tree_to_string),
    (&["MockNotUsedInProduction"], mock_unused::mock_not_used_in_production),
    (&["DefaultPackage"], declaration_defects::default_package),
    (&["EmptyTopLevelDeclaration"], declaration_defects::empty_top_level_declaration),
    (&["DirectInvocationOnMock"], mock_invocations::direct_invocation_on_mock),
    (&["UnusedLabel"], labels::unused_label),
    (&["UnnecessaryTestMethodPrefix"], framework_methods::unnecessary_test_method_prefix),
    (&["MemoizeConstantVisitorStateLookups"], visitor_state::memoize_constant_visitor_state_lookups),
    (&["RuleNotRun"], rule_not_run::rule_not_run),
    (&["UnnecessaryCopy"], unnecessary_copy::unnecessary_copy),
    (&["PackageLocation"], package_location::package_location),
    (&["OptionalNotPresent"], constant_expression_checks::optional_not_present),
    (&["NoAllocation"], no_allocation::no_allocation),
    (&["MustBeClosedChecker", "MustBeClosed"], must_be_closed::must_be_closed),
    (&["GuardedBy"], guarded_by::guarded_by),
];

/// Checks Error Prone runs only on code that is not test-only (`isTestOnlyTarget()` makes them return early).
const NOT_ON_TEST_ONLY: &[&str] = &[
    "BanClassLoader", "BanJNDI", "BanSerializableRead", "CheckedExceptionNotThrown", "ConstantPatternCompile", "DefaultPackage",
    "ExposedPrivateType", "Interruption", "LiteProtoToString", "MissingSummary",
    "StaticAssignmentOfThrowable", "ThrowSpecificExceptions", "TimeInStaticInitializer",
];

/// Other names a check answers to in `@SuppressWarnings` (`altNames`), for the checks ported with theirs.
const ALT_NAMES: &[(&str, &str)] = &[("MissingFail", "missing-fail")];

pub struct ErrorProne;

/// The row that lists, for each file the engine read, the checks of `NP_EP_MAY_REPORT` that may report there.
const MAY_REPORT: &str = "_MayReport";
/// The row for a class an annotation processor changed (`NP_EP_AUDIT_CLASSES`): the class file the build wrote for it
/// has members its source does not explain.
const REWRITTEN: &str = "_Rewritten";
/// The row that lists, for a file, the engine's checks it leaves to Error Prone there.
const HAND_BACK: &str = "_HandBack";
/// The row for a place where Lombok rewrites written code in a way the engine does not model (`lombok_rewrites`):
/// Error Prone has to check that file.
const LOMBOK_REWRITE: &str = "_LombokRewrite";
/// Checks whose findings nitpicker drops inside classes with certain annotations; their rows carry the annotations.
const CLASS_EXEMPTED: &[&str] = &["IdentifierName", "PrivateConstructorForUtilityClass"];
const CLASS_KINDS: &[&str] = &[
    "class_declaration",
    "interface_declaration",
    "enum_declaration",
    "record_declaration",
    "annotation_type_declaration",
];

/// The directories an environment variable lists, split like a class path.
fn paths_of(variable: &str) -> Vec<std::path::PathBuf> {
    std::env::var_os(variable).map(|value| std::env::split_paths(&value).filter(|path| !path.as_os_str().is_empty()).collect()).unwrap_or_default()
}

/// javac analyzes a `package-info.java` that declares types as two units, so Error Prone reports each finding there twice.
fn twice_analyzed(file: &SourceFile) -> bool {
    file.path.replace('\\', "/").rsplit('/').next() == Some("package-info.java")
        && crate::engine::source::children(file.tree.root_node()).into_iter().any(|part| CLASS_KINDS.contains(&part.kind()))
}

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
        if paths_of("NP_EP_CONTEXT_ROOTS").iter().any(|root| std::path::Path::new(&file.path).starts_with(root)) {
            return;
        }
        let scope = &FileScope::of(file);
        let audited = paths_of("NP_EP_AUDIT_CLASSES");
        if !audited.is_empty() {
            for found in processor_audit::rewritten(file, &scope.package, &audited) {
                out.push(Finding {
                    file: file.path.clone(),
                    line: found.line,
                    column: found.column,
                    rule: REWRITTEN.to_string(),
                    message: found.message,
                    symbol: None,
                    priority: None,
                    arguments: None,
                });
            }
        }
        let resolver = &Resolver::new(&project.index, file, scope);
        let _parents = ParentTable::of(file.tree.root_node());
        let mut line_starts = vec![0];
        line_starts.extend(file.text.bytes().enumerate().filter(|(_, byte)| *byte == b'\n').map(|(at, _)| at + 1));
        let selected = std::env::var("NP_EP_ONLY").ok().map(|names| names.split(',').map(String::from).collect());
        let context = Context { resolver, project, file, line_starts, selected, out: std::cell::RefCell::new(Vec::new()), handed: std::cell::RefCell::new(Vec::new()), named: std::cell::RefCell::new(std::collections::HashMap::new()) };
        let wanted = |names: &[&str]| {
            !names.iter().all(|name| context.skipped(name))
                && context.selected.as_ref().is_none_or(|selected| names.iter().any(|name| selected.iter().any(|one| one == name)))
        };
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
        let rewrites = if project.index.lombok { lombok_rewrites::rewrites(&context, file.tree.root_node()) } else { Vec::new() };
        let places: Vec<(usize, usize)> = rewrites.iter().map(|rewrite| context.line_column(rewrite.at)).collect();
        let handed = context.handed.take();
        let mut found = context.out.into_inner();
        for (rewrite, (line, column)) in rewrites.into_iter().zip(places) {
            found.push(Finding {
                file: file.path.clone(),
                line,
                column,
                rule: LOMBOK_REWRITE.to_string(),
                message: rewrite.feature.to_string(),
                symbol: None,
                priority: None,
                arguments: None,
            });
        }
        if twice_analyzed(file) {
            found = found.into_iter().flat_map(|finding| [finding.clone(), finding]).collect();
        }
        out.append(&mut found);
        if !handed.is_empty() {
            out.push(Finding {
                file: file.path.clone(),
                line: 1,
                column: 1,
                rule: HAND_BACK.to_string(),
                message: handed.join(","),
                symbol: None,
                priority: None,
                arguments: None,
            });
        }
        if let Ok(asked) = std::env::var("NP_EP_MAY_REPORT") {
            let asked: Vec<&str> = asked.split(',').filter(|name| !name.is_empty()).collect();
            let found = may_report::may_report(&asked, &file.text, file.tree.root_node(), &project.index);
            out.push(Finding {
                file: file.path.clone(),
                line: 1,
                column: 1,
                rule: MAY_REPORT.to_string(),
                message: found.join(","),
                symbol: None,
                priority: None,
                arguments: None,
            });
        }
    }
}
