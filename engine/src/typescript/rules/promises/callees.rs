//! `calleeCannotReject`: whether every implementation of what a call names is a catching function.
use super::catching::{FUNCTION_LIKES, is_catching, skip_outer};
use crate::typescript::rules::typed::types::{Types, is_declaration_file};
use crate::typescript::types::nodes::{NodeTable, parse_handle};
use crate::typescript::types::tables::{kind as k, node_flags};

fn is_constant(table: &NodeTable, declaration: u32) -> bool {
    table.parent(declaration).is_some_and(|list| table.kind(list) == k::VARIABLE_DECLARATION_LIST && table.flags(list) & node_flags::BLOCK_SCOPED == node_flags::CONST)
}

fn function_of(table: &NodeTable, declaration: u32) -> Option<u32> {
    let kind = table.kind(declaration);
    let initialized = (kind == k::VARIABLE_DECLARATION && is_constant(table, declaration)) || kind == k::PROPERTY_DECLARATION || kind == k::PROPERTY_ASSIGNMENT;
    let found = if initialized { skip_outer(table, table.child(declaration, "initializer")?) } else { declaration };
    (FUNCTION_LIKES.contains(&table.kind(found)) && table.child(found, "body").is_some()).then_some(found)
}

fn implementations(types: &mut Types, callee: &str) -> Vec<String> {
    let Some((index, _, path)) = parse_handle(callee) else { return Vec::new() };
    let Some(table) = types.table_of(path) else { return Vec::new() };
    let named = if table.kind(index) == k::PROPERTY_ACCESS_EXPRESSION { table.child(index, "name").unwrap_or(index) } else { index };
    let mut found = Vec::new();
    for declaration in types.declarations_at(&table.handle(named, path)) {
        let Some((at, _, file)) = parse_handle(&declaration) else { continue };
        if is_declaration_file(file) {
            continue;
        }
        let Some(table) = types.table_of(file) else { continue };
        if let Some(function) = function_of(&table, at) {
            found.push(table.handle(function, file));
        }
    }
    found
}

pub fn cannot_reject(types: &mut Types, callee: &str) -> bool {
    let Some((index, _, path)) = parse_handle(callee) else { return false };
    let Some(table) = types.table_of(path) else { return false };
    let inner = skip_outer(&table, index);
    let handle = table.handle(inner, path);
    if matches!(table.kind(inner), k::ARROW_FUNCTION | k::FUNCTION_EXPRESSION) {
        return is_catching(types, &handle);
    }
    let found = implementations(types, &handle);
    !found.is_empty() && found.iter().all(|function| is_catching(types, function))
}
