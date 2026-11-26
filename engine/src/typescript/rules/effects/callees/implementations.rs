//! `implementationsOf`: the functions that implement a bodiless member of an interface, class or type alias of
//! the project, found through an index of the project's classes with heritage clauses, object literals typed
//! with a type reference and functions returning one. Test sources are left out of the index.
use super::super::flow::is_function_like;
use super::super::views::At;
use super::declarations::{function_like, nodes, resolved_symbol, unwrapped};
use crate::typescript::types::nodes::ROOT;
use super::test_sources::TestSources;
use crate::typescript::rules::typed::types::{Types, is_declaration_file};
use crate::typescript::types::tables::kind as k;
use std::collections::HashMap;
use std::rc::Rc;

/// Implementations by the symbol of the type they implement, as handles in the compiler's walk order, each
/// with whether its file's layout is known (a file outside the listing that the plain test path rule keeps).
pub type Index = HashMap<Option<u64>, Vec<(String, bool)>>;

fn returned_objects(function: &At) -> Vec<(At, At)> {
    let (Some(body), Some(written)) = (function.child("body"), function.child("type")) else { return Vec::new() };
    let Some(name) = written.child("typeName").filter(|_| written.is(k::TYPE_REFERENCE)) else { return Vec::new() };
    let returned: Vec<At> = if body.is(k::BLOCK) {
        body.listed("statements").into_iter().filter(|statement| statement.is(k::RETURN_STATEMENT)).filter_map(|statement| statement.child("expression")).collect()
    } else {
        vec![body]
    };
    returned.iter().map(unwrapped).filter(|object| object.is(k::OBJECT_LITERAL_EXPRESSION)).map(|object| (name.clone(), object)).collect()
}

fn implemented_types(node: &At) -> Vec<(At, At)> {
    let kind = node.kind();
    if (kind == k::CLASS_DECLARATION || kind == k::CLASS_EXPRESSION) && node.table.has_list(node.index, "heritageClauses") {
        let clauses = node.listed("heritageClauses");
        return clauses.iter().flat_map(|clause| clause.listed("types")).filter_map(|each| each.child("expression")).map(|expression| (expression, node.clone())).collect();
    }
    if kind == k::VARIABLE_DECLARATION {
        let Some(written) = node.child("type").filter(|written| written.is(k::TYPE_REFERENCE)) else { return Vec::new() };
        let value = node.child("initializer").map(|initializer| unwrapped(&initializer)).filter(|value| value.is(k::OBJECT_LITERAL_EXPRESSION));
        return value.into_iter().filter_map(|value| Some((written.child("typeName")?, value))).collect();
    }
    if is_function_like(kind) { returned_objects(node) } else { Vec::new() }
}

fn project_files(types: &mut Types, tests: &TestSources) -> Vec<(String, bool)> {
    let mut found = Vec::new();
    for file in types.program_files() {
        if is_declaration_file(&file) || file.contains("/node_modules/") || types.file_origin(&file).external_library {
            continue;
        }
        match tests.is_test(&file) {
            Some(true) => {}
            Some(false) => found.push((file, true)),
            None => found.push((file, false)),
        }
    }
    found
}

/// Builds the index. The plugin walks all project files breadth first from their roots together, so its
/// order is by depth, then file, then place in the file's own breadth-first walk; files are walked one at a
/// time here and the entries sorted that way.
pub fn index(types: &mut Types, tests: &TestSources) -> Index {
    let mut found: Vec<(usize, usize, usize, String, String, bool)> = Vec::new();
    for (number, (file, known)) in project_files(types, tests).into_iter().enumerate() {
        let kept = types.session.has_table(&file) || file == types.file();
        let Some(table) = types.table_of(&file) else { continue };
        let mut level = vec![At { table, path: Rc::from(file.as_str()), index: ROOT }];
        let (mut depth, mut place) = (0, 0);
        while !level.is_empty() {
            let mut next = Vec::new();
            for node in &level {
                for (name, implementation) in implemented_types(node) {
                    found.push((depth, number, place, name.handle(), implementation.handle(), known));
                    place += 1;
                }
                next.extend(node.children());
            }
            level = next;
            depth += 1;
        }
        if !kept {
            types.session.release_table(&file);
        }
    }
    found.sort_by_key(|(depth, number, place, ..)| (*depth, *number, *place));
    let names: Vec<String> = found.iter().map(|(_, _, _, name, _, _)| name.clone()).collect();
    for chunk in names.chunks(4096) {
        let ahead = types.session.symbols_ahead(chunk);
        types.answered(ahead.map(Some));
    }
    let mut index = Index::new();
    for (_, _, _, name, implementation, known) in found {
        let symbol = types.symbol_at_handle(&name);
        let owner = types.unaliased(symbol).map(|symbol| symbol.id);
        index.entry(owner).or_default().push((implementation, known));
    }
    index
}

fn owner_name(container: &At) -> Option<At> {
    match container.kind() {
        k::INTERFACE_DECLARATION | k::CLASS_DECLARATION => container.child("name"),
        k::TYPE_LITERAL => container.parent().filter(|alias| alias.is(k::TYPE_ALIAS_DECLARATION)).and_then(|alias| alias.child("name")),
        _ => None,
    }
}

fn is_bodiless(declaration: &At) -> bool {
    match declaration.kind() {
        k::METHOD_SIGNATURE | k::PROPERTY_SIGNATURE => true,
        k::METHOD_DECLARATION => declaration.child("body").is_none(),
        k::PROPERTY_DECLARATION => declaration.child("initializer").is_none(),
        _ => false,
    }
}

fn member_function(types: &mut Types, implementation: &At, name: &str) -> Option<At> {
    let object = implementation.is(k::OBJECT_LITERAL_EXPRESSION);
    let members = implementation.listed(if object { "properties" } else { "members" });
    let member = members.into_iter().find(|member| member.child("name").and_then(|named| named.identifier()).is_some_and(|text| text == name));
    let Some(member) = member else {
        if object {
            return None;
        }
        let declarations = types.property_declarations(&implementation.handle(), name);
        return nodes(types, &declarations).iter().find_map(function_like);
    };
    if member.is(k::SHORTHAND_PROPERTY_ASSIGNMENT) {
        let symbol = types.shorthand_value_symbol(&member.handle())?;
        let declaration = At::of(types, symbol.value_declaration.as_deref()?)?;
        return function_like(&declaration);
    }
    function_like(&member)
}

/// `implementationsOf` of a declaration, given the index of the run.
pub fn implementations_of(types: &mut Types, index: &Index, declaration: &At) -> Vec<At> {
    if declaration.is(k::SOURCE_FILE) {
        return Vec::new();
    }
    let owner = declaration.parent().as_ref().and_then(owner_name);
    let member = declaration.child("name").and_then(|name| name.identifier()).unwrap_or_default();
    let Some(owner) = owner.filter(|_| !member.is_empty() && is_bodiless(declaration)) else { return Vec::new() };
    let symbol = resolved_symbol(types, &owner);
    let entries = index.get(&symbol).cloned().unwrap_or_default();
    if let Some((unknown, _)) = entries.iter().find(|(_, known)| !known) {
        types.refuse(&format!("{unknown} is outside the file listing, so whether it is a test source is unknown"));
        return Vec::new();
    }
    let handles: Vec<String> = entries.into_iter().map(|(handle, _)| handle).collect();
    nodes(types, &handles).iter().filter_map(|implementation| member_function(types, implementation, &member)).collect()
}
