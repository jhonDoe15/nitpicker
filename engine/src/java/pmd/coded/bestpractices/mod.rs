//! Ports of PMD's best practices rules written in Java.
pub(super) mod calls;
mod declarations;
mod instantiation;
mod resources;
mod tests;

pub use resources::test_class_without_test_cases;

use super::Port;

pub fn port(class: &str) -> Option<Port> {
    Some(match class {
        "MissingOverrideRule" => declarations::missing_override,
        "AvoidReassigningCatchVariablesRule" => declarations::avoid_reassigning_catch_variables,
        "AvoidReassigningParametersRule" => declarations::avoid_reassigning_parameters,
        "AbstractClassWithoutAbstractMethodRule" => declarations::abstract_class_without_abstract_method,
        "UnusedLocalVariableRule" => declarations::unused_local_variable,
        "UseCollectionIsEmptyRule" => calls::use_collection_is_empty,
        "CheckResultSetRule" => calls::check_result_set,
        "UseEnumCollectionsRule" => calls::use_enum_collections,
        "PrimitiveWrapperInstantiationRule" => instantiation::primitive_wrapper_instantiation,
        "LiteralsFirstInComparisonsRule" => calls::literals_first_in_comparisons,
        "UseTryWithResourcesRule" => resources::use_try_with_resources,
        "JUnitUseExpectedRule" => tests::junit_use_expected,
        "UnitTestShouldIncludeAssertRule" => tests::unit_test_should_include_assert,
        "UnnecessaryVarargsArrayCreationRule" => super::design::varargs::unnecessary_varargs_array_creation,
        "ArrayIsStoredDirectlyRule" => super::design::arrays::array_is_stored_directly,
        "MethodReturnsInternalArrayRule" => super::design::arrays::method_returns_internal_array,
        _ => return None,
    })
}
