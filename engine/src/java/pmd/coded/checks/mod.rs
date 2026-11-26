//! Ports of PMD rules written in Java about assertions, boolean returns, appends, serializable fields and calls
//! made while an object is being built.
mod appends;
mod assertions;
mod booleans;
mod overridable;
mod serial;

use super::Port;

pub fn port(class: &str) -> Option<Port> {
    Some(match class {
        "SimplifiableTestAssertionRule" => assertions::simplifiable_test_assertion,
        "ConsecutiveLiteralAppendsRule" => appends::consecutive_literal_appends,
        "SimplifyBooleanReturnsRule" => booleans::simplify_boolean_returns,
        "ConstructorCallsOverridableMethodRule" => overridable::constructor_calls_overridable_method,
        "NonSerializableClassRule" => serial::non_serializable_class,
        _ => return None,
    })
}
