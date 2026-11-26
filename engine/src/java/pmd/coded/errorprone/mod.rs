//! Ports of PMD's error prone rules written in Java.
mod classes;
mod expressions;

use super::Port;

pub fn port(class: &str) -> Option<Port> {
    Some(match class {
        "IdempotentOperationsRule" => expressions::idempotent_operations,
        "CheckSkipResultRule" => expressions::check_skip_result,
        "AvoidUsingOctalValuesRule" => expressions::avoid_using_octal_values,
        "UnnecessaryCaseChangeRule" => expressions::unnecessary_case_change,
        "UselessOperationOnImmutableRule" => expressions::useless_operation_on_immutable,
        "AssignmentToNonFinalStaticRule" => expressions::assignment_to_non_final_static,
        "SingleMethodSingletonRule" => classes::single_method_singleton,
        "JUnitSpellingRule" => classes::junit_spelling,
        "JUnitStaticSuiteRule" => classes::junit_static_suite,
        "DetachedTestCaseRule" => classes::detached_test_case,
        "ProperCloneImplementationRule" => classes::proper_clone_implementation,
        "CloneMethodMustImplementCloneableRule" => classes::clone_method_must_implement_cloneable,
        _ => return None,
    })
}
