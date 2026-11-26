//! Reads of the compiler's tree for decorators and their options.
use crate::typescript::types::nodes::NodeTable;
use crate::typescript::types::tables::kind;

pub fn decorators(table: &NodeTable, node: u32) -> Vec<u32> {
    let can_have = matches!(table.kind(node), kind::PARAMETER | kind::PROPERTY_DECLARATION | kind::METHOD_DECLARATION | kind::GET_ACCESSOR | kind::SET_ACCESSOR | kind::CLASS_EXPRESSION | kind::CLASS_DECLARATION);
    if !can_have {
        return Vec::new();
    }
    table.listed(node, "modifiers").into_iter().filter(|modifier| table.kind(*modifier) == kind::DECORATOR).collect()
}

pub fn decorator_name(table: &NodeTable, decorator: u32) -> Option<String> {
    let expression = table.child(decorator, "expression")?;
    let callee = if table.kind(expression) == kind::CALL_EXPRESSION { table.child(expression, "expression")? } else { expression };
    (table.kind(callee) == kind::IDENTIFIER).then(|| table.text(callee).map(|text| text.into_owned())).flatten()
}

fn is_version_option(table: &NodeTable, property: u32) -> bool {
    table.kind(property) == kind::PROPERTY_ASSIGNMENT
        && table.child(property, "name").is_some_and(|name| table.node_text(name) == "version")
        && table.child(property, "initializer").is_some_and(|value| table.kind(value) == kind::TRUE_KEYWORD)
}

pub fn options_have_version(table: &NodeTable, arguments: &[u32]) -> bool {
    arguments.iter().any(|argument| table.kind(*argument) == kind::OBJECT_LITERAL_EXPRESSION && table.listed(*argument, "properties").iter().any(|property| is_version_option(table, *property)))
}

pub fn has_version_option(table: &NodeTable, call: Option<u32>) -> bool {
    call.is_some_and(|call| table.kind(call) == kind::CALL_EXPRESSION && options_have_version(table, &table.listed(call, "arguments")))
}
