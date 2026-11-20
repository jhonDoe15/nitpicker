//! Which exported functions and components are checked, and the members of their options or props.
use super::resolve::target_of;
use super::syntax::{Candidate, Key, binding_members, candidates_of, is_component_candidate, is_options_parameter, is_wrapper_call, text, unwrap_expression};
use super::{Analysis, Member, Target, declared};
use crate::typescript::types::nodes::{NodeTable, ROOT, parse_handle};
use crate::typescript::types::server::{Symbol, Type};
use crate::typescript::types::tables::kind as K;
use crate::typescript::types::tables::type_flags;
use serde_json::json;
use std::collections::{HashMap, HashSet};

struct Entry {
    target: Target,
    key_nodes: Vec<String>,
}

fn is_javascript_file(path: &str) -> bool {
    [".js", ".mjs", ".cjs", ".jsx"].iter().any(|extension| path.ends_with(extension))
}

/// The declarations a file exports, aliases followed.
fn exported_declarations(analysis: &mut Analysis, path: &str, table: &NodeTable) -> Result<HashSet<String>, String> {
    let Some(module) = analysis.session.symbol_at(&table.handle(ROOT, path))? else {
        return Ok(HashSet::new());
    };
    let mut declarations = HashSet::new();
    for symbol in analysis.session.exports_of(&module)?.iter() {
        if let Some(resolved) = analysis.session.resolved(Some(symbol.clone()))? {
            declarations.extend(resolved.declarations.iter().cloned());
        }
    }
    Ok(declarations)
}

/// Properties of the parameter's type that are declared in a checked file, by name. A property found in
/// several members of a union keeps the declaration that comes first by file name and position, so the answer
/// does not depend on the order the compiler lists the members in.
fn owned_members(analysis: &mut Analysis, kind: &Type) -> Result<Vec<(String, String)>, String> {
    let bare: Option<Type> = analysis.session.ask("getNonNullableType", json!({ "type": kind.id }))?;
    let Some(bare) = bare else { return Ok(Vec::new()) };
    let apparent: Option<Type> = analysis.session.ask("getApparentType", json!({ "type": bare.id }))?;
    let Some(apparent) = apparent else { return Ok(Vec::new()) };
    let parts: Vec<Type> = if apparent.flags & type_flags::UNION != 0 {
        analysis.session.ask::<Option<Vec<Type>>>("getTypesOfType", json!({ "objectId": apparent.id }))?.unwrap_or_default()
    } else {
        vec![apparent]
    };
    let mut entries: Vec<(String, String)> = Vec::new();
    for part in parts {
        let properties: Option<Vec<Symbol>> = analysis.session.ask("getPropertiesOfType", json!({ "type": part.id }))?;
        for symbol in properties.unwrap_or_default() {
            let owned = symbol.declarations.iter().find(|declaration| {
                parse_handle(declaration).is_some_and(|(_, kind, path)| {
                    matches!(kind, K::PROPERTY_SIGNATURE | K::METHOD_SIGNATURE | K::PROPERTY_DECLARATION) && analysis.owned.contains(path)
                })
            });
            if let Some(declaration) = owned {
                entries.push((symbol.name.clone(), declaration.clone()));
            }
        }
    }
    let mut members: Vec<(String, String, (Vec<u16>, u32))> = Vec::new();
    for (name, declaration) in entries {
        let (table, node) = declared(analysis, &declaration)?;
        let (_, _, path) = parse_handle(&declaration).ok_or_else(|| format!("unexpected node handle {declaration}"))?;
        let place = (path.encode_utf16().collect::<Vec<u16>>(), table.start(node));
        match members.iter_mut().find(|(known, _, _)| *known == name) {
            Some(entry) if place < entry.2 => (entry.1, entry.2) = (declaration, place),
            Some(_) => {}
            None => members.push((name, declaration, place)),
        }
    }
    Ok(members.into_iter().map(|(name, declaration, _)| (name, declaration)).collect())
}

fn parameter_members(analysis: &mut Analysis, path: &str, table: &NodeTable, parameter: u32) -> Result<Vec<(String, String)>, String> {
    if is_javascript_file(path) {
        return Ok(binding_members(table, parameter).into_iter().map(|(name, element)| (name, table.handle(element, path))).collect());
    }
    let kind: Option<Type> = analysis.session.ask("getTypeAtLocation", json!({ "location": table.handle(parameter, path) }))?;
    match kind {
        Some(kind) if kind.flags & type_flags::TYPE_PARAMETER == 0 => owned_members(analysis, &kind),
        _ => Ok(Vec::new()),
    }
}

fn member_of(analysis: &mut Analysis, name: String, declaration: String) -> Result<Member, String> {
    let (table, index) = declared(analysis, &declaration)?;
    let (_, _, path) = parse_handle(&declaration).expect("handle");
    Ok(Member { name, file_name: path.to_string(), line: table.source().line_of(table.start(index)), declaration })
}

fn file_targets(analysis: &mut Analysis, path: &str) -> Result<Vec<Entry>, String> {
    let table = analysis.table(path)?;
    let exported = exported_declarations(analysis, path, &table)?;
    let mut entries = Vec::new();
    for Candidate { name, function, key } in candidates_of(&table, ROOT) {
        let key_nodes = match key {
            Key::Nodes(nodes) => nodes.into_iter().map(|node| table.handle(node, path)).collect(),
            Key::DeclarationsOf { name, statement } => {
                let symbol = match name {
                    Some(name) => analysis.session.symbol_at(&table.handle(name, path))?,
                    None => None,
                };
                symbol.map_or_else(|| vec![table.handle(statement, path)], |symbol| symbol.declarations.clone())
            }
        };
        let parameters = table.listed(function, "parameters");
        let component = is_component_candidate(&name, path, analysis.input.react);
        let index = if component {
            (!parameters.is_empty()).then_some(0)
        } else {
            let options = parameters.iter().position(|parameter| is_options_parameter(&table, *parameter));
            options.filter(|_| key_nodes.iter().any(|node| exported.contains(node)))
        };
        let Some(index) = index else { continue };
        let found = parameter_members(analysis, path, &table, parameters[index])?;
        if found.is_empty() {
            continue;
        }
        let mut members = Vec::new();
        for (member, declaration) in found {
            members.push(member_of(analysis, member, declaration)?);
        }
        let kind = if component { "component" } else { "function" };
        entries.push(Entry { target: Target { name, file_name: path.to_string(), kind, index, members, refs: Vec::new() }, key_nodes });
    }
    Ok(entries)
}

/// The type alias or interface a member is declared in.
fn owner_type(analysis: &mut Analysis, declaration: &str) -> Result<Option<String>, String> {
    let (table, index) = declared(analysis, declaration)?;
    let (_, _, path) = parse_handle(declaration).expect("handle");
    let owner = std::iter::successors(table.parent(index), |node| table.parent(*node))
        .find(|node| matches!(table.kind(*node), K::TYPE_ALIAS_DECLARATION | K::INTERFACE_DECLARATION));
    Ok(owner.map(|owner| table.handle(owner, path)))
}

fn referenced_type_name(table: &NodeTable, node: u32) -> Option<u32> {
    match table.kind(node) {
        K::TYPE_REFERENCE => {
            let name = table.child(node, "typeName")?;
            if table.kind(name) == K::IDENTIFIER { Some(name) } else { table.child(name, "right") }
        }
        K::EXPRESSION_WITH_TYPE_ARGUMENTS => table.child(node, "expression").filter(|expression| table.kind(*expression) == K::IDENTIFIER),
        _ => None,
    }
}

/// Owner types that more than one place in the project names: their members are someone else's too.
fn shared_types(analysis: &mut Analysis, owners: &HashSet<String>) -> Result<HashSet<String>, String> {
    let mut names = HashSet::new();
    for owner in owners {
        let (table, index) = declared(analysis, owner)?;
        names.extend(table.child(index, "name").map(|name| text(&table, name)));
    }
    let mut uses: HashMap<String, usize> = HashMap::new();
    for path in analysis.files.clone() {
        let table = analysis.table(&path)?;
        let named: Vec<String> = (ROOT..table.count())
            .filter_map(|node| referenced_type_name(&table, node))
            .filter(|name| names.contains(&text(&table, *name)) && !in_documentation(&table, *name))
            .map(|name| table.handle(name, &path))
            .collect();
        analysis.session.symbols_ahead(&named)?;
        for handle in named {
            let symbol = analysis.session.symbol_at(&handle)?;
            let Some(resolved) = analysis.session.resolved(symbol)? else { continue };
            for declaration in resolved.declarations.iter().filter(|declaration| owners.contains(*declaration)) {
                *uses.entry(declaration.clone()).or_default() += 1;
            }
        }
    }
    Ok(uses.into_iter().filter(|(_, count)| *count > 1).map(|(owner, _)| owner).collect())
}

/// Nodes of documentation comments are in the table but not in the tree the checks walk.
pub fn in_documentation(table: &NodeTable, node: u32) -> bool {
    std::iter::successors(Some(node), |node| table.parent(*node)).any(|node| table.kind(node) == K::JS_DOC || table.is_reparsed(node))
}

pub fn collect(analysis: &mut Analysis) -> Result<(), String> {
    let mut entries = Vec::new();
    for path in analysis.files.clone() {
        if analysis.owned.contains(&path) {
            entries.extend(file_targets(analysis, &path)?);
        }
    }
    let mut owner_of: HashMap<String, Option<String>> = HashMap::new();
    for entry in &entries {
        for member in &entry.target.members {
            if !owner_of.contains_key(&member.declaration) {
                let owner = owner_type(analysis, &member.declaration)?;
                owner_of.insert(member.declaration.clone(), owner);
            }
        }
    }
    let owners: HashSet<String> = owner_of.values().flatten().cloned().collect();
    let shared = shared_types(analysis, &owners)?;
    for mut entry in entries {
        entry.target.members.retain(|member| !owner_of[&member.declaration].as_ref().is_some_and(|owner| shared.contains(owner)));
        if entry.target.members.is_empty() {
            continue;
        }
        let registry = &mut analysis.registry;
        registry.names.insert(entry.target.name.clone());
        registry.targets.push(entry.target);
        for node in entry.key_nodes {
            registry.by_declaration.insert(node, registry.targets.len() - 1);
        }
    }
    Ok(())
}

/// `(node, name, value)` of the statements that may rename a target: `export default x` and `const a = x`.
fn aliases_of(table: &NodeTable, statement: u32) -> Vec<(u32, String, u32)> {
    match table.kind(statement) {
        K::EXPORT_ASSIGNMENT => table.child(statement, "expression").map(|value| (statement, "default".to_string(), value)).into_iter().collect(),
        K::VARIABLE_STATEMENT => {
            let list = table.child(statement, "declarationList");
            let declarations = list.map(|list| table.listed(list, "declarations")).unwrap_or_default();
            declarations
                .into_iter()
                .filter_map(|declaration| {
                    let name = table.child(declaration, "name").filter(|name| table.kind(*name) == K::IDENTIFIER)?;
                    Some((declaration, text(table, name), table.child(declaration, "initializer")?))
                })
                .collect()
        }
        _ => Vec::new(),
    }
}

/// The name or member access inside `memo(...)` or `forwardRef(...)`.
pub fn wrapped_reference(table: &NodeTable, value: u32) -> Option<u32> {
    let call = unwrap_expression(table, value);
    let argument = is_wrapper_call(table, call).then(|| table.listed(call, "arguments").first().copied()).flatten()?;
    let reference = unwrap_expression(table, argument);
    matches!(table.kind(reference), K::IDENTIFIER | K::PROPERTY_ACCESS_EXPRESSION).then_some(reference)
}

pub fn register_wrapper_aliases(analysis: &mut Analysis) -> Result<(), String> {
    let mut aliases = Vec::new();
    for path in analysis.files.clone() {
        let table = analysis.table(&path)?;
        for statement in table.listed(ROOT, "statements") {
            for (node, name, value) in aliases_of(&table, statement) {
                let Some(reference) = wrapped_reference(&table, value) else { continue };
                if let Some(target) = target_of(analysis, &path, &table, reference)? {
                    aliases.push((target, table.handle(node, &path), name));
                }
            }
        }
    }
    for (target, node, name) in aliases {
        analysis.registry.by_declaration.insert(node, target);
        analysis.registry.names.insert(name);
    }
    Ok(())
}
