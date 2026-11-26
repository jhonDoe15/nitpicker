//! Where targets are called, rendered or handed on, file by file.
use super::paths;
use super::resolve::{name_of_declaration, referenced_symbol, target_of, target_of_symbol};
use super::syntax::{Passes, callee_name, is_string_literal_like, is_wrapper_call, jsx_passes, object_passes, text, unwrap_expression};
use super::targets::wrapped_reference;
use super::{Analysis, Reference, declared};
use crate::typescript::types::nodes::{NodeTable, ROOT};
use crate::typescript::types::server::Symbol;
use crate::typescript::types::tables::kind as K;
use crate::typescript::types::tables::{node_flags, symbol_flags};
use std::collections::HashSet;
use std::rc::Rc;

struct State<'f> {
    path: &'f str,
    table: &'f NodeTable,
    role: String,
    package_dir: Option<String>,
    names: HashSet<String>,
    namespaces: HashSet<String>,
    consumed: HashSet<u32>,
}

fn is_type_node(kind: u32) -> bool {
    (K::FIRST_TYPE_NODE..=K::LAST_TYPE_NODE).contains(&kind)
        || matches!(
            kind,
            K::ANY_KEYWORD
                | K::UNKNOWN_KEYWORD
                | K::NUMBER_KEYWORD
                | K::BIG_INT_KEYWORD
                | K::OBJECT_KEYWORD
                | K::BOOLEAN_KEYWORD
                | K::STRING_KEYWORD
                | K::SYMBOL_KEYWORD
                | K::VOID_KEYWORD
                | K::UNDEFINED_KEYWORD
                | K::NEVER_KEYWORD
                | K::INTRINSIC_KEYWORD
                | K::EXPRESSION_WITH_TYPE_ARGUMENTS
        )
}

fn is_skipped_subtree(kind: u32) -> bool {
    matches!(
        kind,
        K::IMPORT_DECLARATION | K::EXPORT_DECLARATION | K::IMPORT_EQUALS_DECLARATION | K::INTERFACE_DECLARATION | K::TYPE_ALIAS_DECLARATION | K::JSX_CLOSING_ELEMENT
    ) || is_type_node(kind)
}

fn record(analysis: &mut Analysis, target: usize, state: &State, kind: &'static str, passes: Option<Passes>) {
    analysis.registry.targets[target].refs.push(Reference { kind, passes, role: state.role.clone(), package_dir: state.package_dir.clone() });
}

fn leftmost(table: &NodeTable, mut node: u32) -> u32 {
    while table.kind(node) == K::PROPERTY_ACCESS_EXPRESSION {
        match table.child(node, "expression") {
            Some(inner) => node = inner,
            None => break,
        }
    }
    node
}

fn may_be_target(state: &State, node: u32) -> bool {
    let table = state.table;
    match table.kind(node) {
        K::IDENTIFIER => state.names.contains(&text(table, node)),
        K::PROPERTY_ACCESS_EXPRESSION => {
            let root = leftmost(table, node);
            table.child(node, "name").is_some_and(|name| state.names.contains(&text(table, name)))
                || (table.kind(root) == K::IDENTIFIER && state.namespaces.contains(&text(table, root)))
        }
        _ => false,
    }
}

fn referenced_component(analysis: &mut Analysis, state: &State, node: Option<u32>) -> Result<Option<usize>, String> {
    let Some(node) = node.filter(|node| matches!(state.table.kind(*node), K::IDENTIFIER | K::PROPERTY_ACCESS_EXPRESSION)) else {
        return Ok(None);
    };
    if !may_be_target(state, node) {
        return Ok(None);
    }
    let target = target_of(analysis, state.path, state.table, node)?;
    Ok(target.filter(|target| analysis.registry.targets[*target].kind == "component"))
}

fn consume(state: &mut State, node: u32) {
    state.consumed.insert(node);
    if state.table.kind(node) == K::PROPERTY_ACCESS_EXPRESSION {
        state.consumed.extend(state.table.child(node, "name"));
    }
}

fn escape_module(analysis: &mut Analysis, state: &State, module: Option<&Symbol>) -> Result<(), String> {
    let Some(module) = module else { return Ok(()) };
    for symbol in analysis.session.exports_of(module)?.iter() {
        let resolved = analysis.session.resolved(Some(symbol.clone()))?;
        if let Some(target) = target_of_symbol(analysis, resolved.as_deref()) {
            record(analysis, target, state, "escape", None);
        }
    }
    Ok(())
}

fn escape_files(analysis: &mut Analysis, state: &State, matches: impl Fn(&str) -> bool) -> Result<(), String> {
    for file in analysis.files.clone().into_iter().filter(|file| matches(file)) {
        let module = analysis.session.symbol_at(&format!("{ROOT}.{}.{file}", K::SOURCE_FILE))?;
        escape_module(analysis, state, module.as_deref())?;
    }
    Ok(())
}

fn is_import_meta_glob(table: &NodeTable, callee: u32) -> bool {
    table.kind(callee) == K::PROPERTY_ACCESS_EXPRESSION
        && table.child(callee, "expression").is_some_and(|expression| table.kind(expression) == K::META_PROPERTY)
        && table.child(callee, "name").is_some_and(|name| matches!(text(table, name).as_str(), "glob" | "globEager"))
}

fn is_module_load(table: &NodeTable, callee: u32) -> bool {
    table.kind(callee) == K::IMPORT_KEYWORD || (table.kind(callee) == K::IDENTIFIER && text(table, callee) == "require") || is_import_meta_glob(table, callee)
}

fn handle_module_load(analysis: &mut Analysis, state: &State, call: u32, callee: u32) -> Result<(), String> {
    let table = state.table;
    let specifier = table.listed(call, "arguments").first().copied();
    let directory = paths::dirname(state.path);
    if is_import_meta_glob(table, callee) {
        let texts: Vec<String> = match specifier {
            Some(argument) if is_string_literal_like(table, argument) => vec![text(table, argument)],
            Some(argument) if table.kind(argument) == K::ARRAY_LITERAL_EXPRESSION => {
                table.listed(argument, "elements").into_iter().filter(|element| is_string_literal_like(table, *element)).map(|element| text(table, element)).collect()
            }
            _ => Vec::new(),
        };
        let patterns: Vec<String> = texts.iter().filter(|pattern| pattern.starts_with('.')).map(|pattern| paths::join(directory, pattern)).collect();
        if let Some(unsupported) = patterns.iter().find(|pattern| !paths::glob_is_supported(pattern)) {
            return Err(format!("the glob {unsupported} uses syntax the engine does not match"));
        }
        return escape_files(analysis, state, |file| patterns.iter().any(|pattern| paths::glob_matches(pattern, file)));
    }
    match specifier {
        Some(template) if table.kind(template) == K::TEMPLATE_EXPRESSION => {
            let prefix = table.child(template, "head").map(|head| text(table, head)).unwrap_or_default();
            if prefix.starts_with('.') {
                let directory = paths::join(directory, &prefix);
                escape_files(analysis, state, |file| file.starts_with(&directory))?;
            }
        }
        Some(literal) if is_string_literal_like(table, literal) => {
            let module = analysis.session.symbol_at(&table.handle(literal, state.path))?;
            escape_module(analysis, state, module.as_deref())?;
        }
        _ => {}
    }
    Ok(())
}

fn factory_passes(table: &NodeTable, call: u32) -> Passes {
    let arguments = table.listed(call, "arguments");
    if arguments.iter().any(|argument| table.kind(*argument) == K::SPREAD_ELEMENT) {
        return Passes::everything();
    }
    let mut passes = match arguments.get(1) {
        Some(props) if table.kind(*props) != K::NULL_KEYWORD => object_passes(table, *props),
        _ => Passes::default(),
    };
    if arguments.len() > 2 {
        passes.add("children");
    }
    passes
}

fn handle_element_call(analysis: &mut Analysis, state: &mut State, call: u32, name: &str) -> Result<(), String> {
    let table = state.table;
    if name == "cloneElement" {
        let reference = Reference { kind: "call", passes: Some(factory_passes(table, call)), role: state.role.clone(), package_dir: state.package_dir.clone() };
        analysis.registry.cloned.push(reference);
        return Ok(());
    }
    let kind = table.listed(call, "arguments").first().map(|first| unwrap_expression(table, *first));
    let Some(target) = referenced_component(analysis, state, kind)? else { return Ok(()) };
    consume(state, kind.expect("referenced"));
    record(analysis, target, state, "call", Some(factory_passes(table, call)));
    Ok(())
}

fn options_passes(table: &NodeTable, call: u32, index: usize) -> Passes {
    let arguments = table.listed(call, "arguments");
    let leading = &arguments[..arguments.len().min(index + 1)];
    if leading.iter().any(|argument| table.kind(*argument) == K::SPREAD_ELEMENT) {
        return Passes::everything();
    }
    leading.get(index).map_or_else(Passes::default, |options| object_passes(table, *options))
}

fn handle_call(analysis: &mut Analysis, state: &mut State, call: u32) -> Result<(), String> {
    let table = state.table;
    let Some(expression) = table.child(call, "expression") else { return Ok(()) };
    let callee = unwrap_expression(table, expression);
    let name = callee_name(table, callee);
    if is_module_load(table, callee) {
        handle_module_load(analysis, state, call, callee)?;
    } else if let Some(name) = name.filter(|name| matches!(name.as_str(), "createElement" | "jsx" | "jsxs" | "jsxDEV" | "cloneElement")) {
        handle_element_call(analysis, state, call, &name)?;
    } else if may_be_target(state, callee) {
        if let Some(target) = target_of(analysis, state.path, table, callee)? {
            consume(state, callee);
            let found = &analysis.registry.targets[target];
            let passes = if found.kind == "function" { options_passes(table, call, found.index) } else { Passes::everything() };
            record(analysis, target, state, "call", Some(passes));
        }
    }
    if is_wrapper_call(table, call) {
        let aliased = table.parent(call).is_some_and(|parent| matches!(table.kind(parent), K::VARIABLE_DECLARATION | K::EXPORT_ASSIGNMENT));
        if let Some(reference) = wrapped_reference(table, call).filter(|_| aliased) {
            consume(state, reference);
        }
    }
    Ok(())
}

fn handle_default_props(analysis: &mut Analysis, state: &State, assignment: u32) -> Result<(), String> {
    let table = state.table;
    let (Some(left), Some(operator), Some(right)) = (table.child(assignment, "left"), table.child(assignment, "operatorToken"), table.child(assignment, "right")) else {
        return Ok(());
    };
    let is_defaults = table.kind(operator) == K::EQUALS_TOKEN
        && table.kind(left) == K::PROPERTY_ACCESS_EXPRESSION
        && table.child(left, "name").is_some_and(|name| text(table, name) == "defaultProps");
    if !is_defaults {
        return Ok(());
    }
    if let Some(target) = referenced_component(analysis, state, table.child(left, "expression"))? {
        record(analysis, target, state, "defaults", Some(object_passes(table, right)));
    }
    Ok(())
}

/// `name.member`, unless the member hands the function on (`call`, `apply`, `bind`).
fn is_benign_access(table: &NodeTable, identifier: u32) -> bool {
    table.parent(identifier).is_some_and(|parent| {
        table.kind(parent) == K::PROPERTY_ACCESS_EXPRESSION
            && table.child(parent, "expression") == Some(identifier)
            && !table.child(parent, "name").is_some_and(|name| matches!(text(table, name).as_str(), "call" | "apply" | "bind"))
    })
}

fn is_declaration_name(analysis: &mut Analysis, state: &State, symbol: Option<&Symbol>, identifier: u32) -> Result<bool, String> {
    let own = state.table.handle(identifier, state.path);
    for declaration in symbol.map(|symbol| symbol.declarations.clone()).unwrap_or_default() {
        let (table, index) = declared(analysis, &declaration)?;
        let (_, _, path) = crate::typescript::types::nodes::parse_handle(&declaration).expect("handle");
        if name_of_declaration(&table, index)?.is_some_and(|name| table.handle(name, path) == own) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn handle_identifier(analysis: &mut Analysis, state: &State, identifier: u32) -> Result<(), String> {
    let table = state.table;
    let parent = table.parent(identifier);
    if state.consumed.contains(&identifier) || parent.is_some_and(|parent| table.kind(parent) == K::EXPORT_ASSIGNMENT) {
        return Ok(());
    }
    let name = text(table, identifier);
    if state.namespaces.contains(&name) && !is_benign_access(table, identifier) && !parent.is_some_and(|parent| table.kind(parent) == K::NAMESPACE_IMPORT) {
        let symbol = referenced_symbol(analysis, state.path, table, identifier)?;
        if let Some(module) = symbol.filter(|symbol| symbol.flags & symbol_flags::VALUE_MODULE != 0) {
            escape_module(analysis, state, Some(&module))?;
        }
    }
    let member_of = parent.filter(|parent| table.kind(*parent) == K::PROPERTY_ACCESS_EXPRESSION && table.child(*parent, "name") == Some(identifier));
    let via_namespace = member_of.is_some_and(|parent| {
        let root = leftmost(table, parent);
        table.kind(root) == K::IDENTIFIER && state.namespaces.contains(&text(table, root))
    });
    if !(state.names.contains(&name) || via_namespace) {
        return Ok(());
    }
    let symbol = referenced_symbol(analysis, state.path, table, identifier)?;
    let Some(target) = target_of_symbol(analysis, symbol.as_deref()) else { return Ok(()) };
    if is_declaration_name(analysis, state, symbol.as_deref(), identifier)? || is_benign_access(table, identifier) {
        return Ok(());
    }
    record(analysis, target, state, "escape", None);
    Ok(())
}

fn visit(analysis: &mut Analysis, state: &mut State, node: u32) -> Result<(), String> {
    match state.table.kind(node) {
        K::JSX_OPENING_ELEMENT | K::JSX_SELF_CLOSING_ELEMENT => {
            let tag = state.table.child(node, "tagName");
            if let Some(target) = referenced_component(analysis, state, tag)? {
                consume(state, tag.expect("referenced"));
                record(analysis, target, state, "call", Some(jsx_passes(state.table, node)));
            }
            Ok(())
        }
        K::CALL_EXPRESSION => handle_call(analysis, state, node),
        K::BINARY_EXPRESSION => handle_default_props(analysis, state, node),
        K::IDENTIFIER => handle_identifier(analysis, state, node),
        _ => Ok(()),
    }
}

/// Names that may stand for a target in this file: every target name, and the local names of imports that
/// resolve to one. And the names of namespace imports.
fn imported_names(analysis: &mut Analysis, path: &str, table: &NodeTable) -> Result<(HashSet<String>, HashSet<String>), String> {
    let mut names = analysis.registry.names.clone();
    let mut namespaces = HashSet::new();
    let mut locals = Vec::new();
    for statement in table.listed(ROOT, "statements").into_iter().filter(|statement| table.kind(*statement) == K::IMPORT_DECLARATION) {
        let Some(clause) = table.child(statement, "importClause") else { continue };
        let bindings = table.child(clause, "namedBindings");
        if let Some(namespace) = bindings.filter(|bindings| table.kind(*bindings) == K::NAMESPACE_IMPORT) {
            namespaces.extend(table.child(namespace, "name").map(|name| text(table, name)));
        }
        let named = bindings.filter(|bindings| table.kind(*bindings) == K::NAMED_IMPORTS).map(|bindings| table.listed(bindings, "elements")).unwrap_or_default();
        locals.extend(table.child(clause, "name").into_iter().chain(named.into_iter().filter_map(|element| table.child(element, "name"))));
    }
    symbols_ahead(analysis, path, table, &locals)?;
    for local in locals {
        if target_of(analysis, path, table, local)?.is_some() {
            names.insert(text(table, local));
        }
    }
    Ok((names, namespaces))
}

fn may_name_target(state: &State, identifier: u32) -> bool {
    let table = state.table;
    let parent = table.parent(identifier);
    if parent.is_some_and(|parent| table.kind(parent) == K::SHORTHAND_PROPERTY_ASSIGNMENT && table.child(parent, "name") == Some(identifier)) {
        return false;
    }
    let name = text(table, identifier);
    state.names.contains(&name)
        || state.namespaces.contains(&name)
        || parent.is_some_and(|parent| {
            table.kind(parent) == K::PROPERTY_ACCESS_EXPRESSION && {
                let root = leftmost(table, parent);
                table.kind(root) == K::IDENTIFIER && state.namespaces.contains(&text(table, root))
            }
        })
}

fn walked(table: &NodeTable) -> Vec<u32> {
    let mut nodes = Vec::new();
    let mut pending = vec![ROOT];
    while let Some(node) = pending.pop() {
        nodes.push(node);
        if !is_skipped_subtree(table.kind(node)) {
            let children: Vec<u32> = table.children(node).filter(|child| table.flags(*child) & node_flags::REPARSED == 0).collect();
            pending.extend(children.into_iter().rev());
        }
    }
    nodes
}

fn symbols_ahead(analysis: &mut Analysis, path: &str, table: &NodeTable, identifiers: &[u32]) -> Result<(), String> {
    let handles: Vec<String> = identifiers.iter().map(|node| table.handle(*node, path)).collect();
    if analysis.session.symbols_ahead(&handles).is_err() {
        return Ok(());
    }
    let found: Vec<Rc<Symbol>> = handles.iter().filter_map(|handle| analysis.session.known_symbol_at(handle).flatten()).collect();
    let _ = analysis.session.aliased_ahead(found.iter().map(|symbol| &**symbol));
    Ok(())
}

fn ask_ahead(analysis: &mut Analysis, state: &State, nodes: &[u32]) -> Result<(), String> {
    let identifiers: Vec<u32> = nodes.iter().copied().filter(|node| state.table.kind(*node) == K::IDENTIFIER && may_name_target(state, *node)).collect();
    symbols_ahead(analysis, state.path, state.table, &identifiers)
}

pub fn collect(analysis: &mut Analysis) -> Result<(), String> {
    for path in analysis.files.clone() {
        let info = &analysis.input.files[&path];
        let (role, package_dir) = (info.role.clone(), info.package_dir.clone());
        let table = analysis.table(&path)?;
        let (names, namespaces) = imported_names(analysis, &path, &table)?;
        let mut state = State { path: &path, table: &table, role, package_dir, names, namespaces, consumed: HashSet::new() };
        let nodes = walked(&table);
        ask_ahead(analysis, &state, &nodes)?;
        for node in nodes {
            visit(analysis, &mut state, node)?;
        }
    }
    Ok(())
}
