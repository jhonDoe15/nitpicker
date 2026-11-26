//! Ports of PMD's best practices rules written in Java.
mod calls;
mod declarations;

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
        _ => return None,
    })
}
