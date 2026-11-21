//! The project's callables: functions, methods, constructors, getters and callbacks passed at module level.
use super::syntax::*;
use super::targets::target_site;
use super::types::{Scoped, scoped_statements};
use super::{At, Cx, Found, Site};
use crate::typescript::types::nodes::ROOT;
use crate::typescript::types::tables::kind as K;
use std::collections::HashMap;
use std::rc::Rc;

fn reserve(cx: &mut Cx, candidate: String) -> String {
    let count = cx.registry.site_counts.entry(candidate.clone()).or_insert(0);
    *count += 1;
    if *count == 1 { candidate } else { format!("{candidate}~{count}") }
}

fn register(cx: &mut Cx, site: Site) -> Found<usize> {
    let index = cx.registry.sites.len();
    let node = site.node;
    if !site.callback {
        cx.registry.site_names.insert(site.name.clone());
    }
    cx.registry.sites.push(site);
    cx.registry.site_by_node.insert(node, index);
    let table = cx.table(node.file);
    if let Some(name) = name_of(&table, node.node) {
        let symbol = cx.symbol(At { file: node.file, node: name })?;
        for declaration in cx.declarations(symbol.as_deref())? {
            if is_closure(cx.kind(declaration)) {
                cx.registry.site_by_node.insert(declaration, index);
            }
        }
    }
    Ok(index)
}

struct Found3 {
    node: u32,
    declaration: u32,
    name: String,
}

fn statement_sites(t: T, statement: u32) -> Vec<Found3> {
    match t.kind(statement) {
        K::FUNCTION_DECLARATION if t.child(statement, "body").is_some() => {
            vec![Found3 { node: statement, declaration: statement, name: name_of(t, statement).map_or_else(|| "default".to_string(), |name| own_text(t, name)) }]
        }
        K::VARIABLE_STATEMENT => t
            .child(statement, "declarationList")
            .map(|list| t.listed(list, "declarations"))
            .unwrap_or_default()
            .into_iter()
            .filter_map(|declaration| {
                let name = name_of(t, declaration).filter(|name| t.kind(*name) == K::IDENTIFIER)?;
                let node = wrapped_function(t, t.child(declaration, "initializer"))?;
                Some(Found3 { node, declaration, name: own_text(t, name) })
            })
            .collect(),
        K::EXPORT_ASSIGNMENT => wrapped_function(t, expression(t, statement)).map(|node| Found3 { node, declaration: statement, name: "default".to_string() }).into_iter().collect(),
        _ => Vec::new(),
    }
}

fn is_single(t: T, member: u32) -> bool {
    let name = member_name(t, member);
    let siblings = t.parent(member).filter(|parent| is_class_like(t.kind(*parent)) || matches!(t.kind(*parent), K::INTERFACE_DECLARATION | K::TYPE_LITERAL)).map(|parent| t.listed(parent, "members")).unwrap_or_default();
    !siblings.into_iter().any(|other| other != member && t.kind(other) == t.kind(member) && member_name(t, other) == name)
}

fn is_bodyless(t: T, member: u32) -> bool {
    let kind = t.kind(member);
    let in_interface = t.parent(member).is_some_and(|parent| t.kind(parent) == K::INTERFACE_DECLARATION);
    let is_signature = in_interface && matches!(kind, K::METHOD_SIGNATURE | K::GET_ACCESSOR);
    let is_abstract = has_modifier(t, member, K::ABSTRACT_KEYWORD) && matches!(kind, K::METHOD_DECLARATION | K::GET_ACCESSOR);
    (is_signature || is_abstract) && t.child(member, "body").is_none() && is_single(t, member)
}

fn member_function(t: T, member: u32) -> Option<u32> {
    match t.kind(member) {
        K::PROPERTY_DECLARATION => wrapped_function(t, t.child(member, "initializer")),
        K::METHOD_DECLARATION | K::CONSTRUCTOR | K::GET_ACCESSOR => t.child(member, "body").map(|_| member),
        _ => None,
    }
}

fn class_sites(cx: &mut Cx, file: u32, entry: usize, container: u32) -> Found<()> {
    let table = cx.table(file);
    let t = &*table;
    let path = cx.registry.entries[entry].file.clone();
    for member in t.listed(container, "members") {
        let bodyless = is_bodyless(t, member);
        let Some(node) = (if bodyless { Some(member) } else { member_function(t, member) }) else { continue };
        let kind = t.kind(member);
        let name = if kind == K::CONSTRUCTOR { "constructor".to_string() } else { member_name(t, member).unwrap_or_else(|| "default".to_string()) };
        let is_static = has_modifier(t, member, K::STATIC_KEYWORD);
        let owner = &cx.registry.entries[entry];
        let (owner_id, exported, class_node) = (owner.id.clone(), owner.exported && !is_hidden(t, member), owner.node);
        let base = format!("{owner_id}.{name}");
        let id = reserve(cx, if is_static { format!("{base}(static)") } else { base });
        let site = Site {
            id,
            name,
            kind: match kind {
                K::CONSTRUCTOR => "constructor",
                K::GET_ACCESSOR => "accessor",
                _ => "method",
            },
            owner: Some(owner_id),
            node: At { file, node },
            declaration: At { file, node: member },
            path: path.clone(),
            exported,
            anchor: None,
            line: line_of(t, name_of(t, member).unwrap_or(member)),
            callback: false,
            member: Some(member),
            class_entry: Some(entry),
            is_static,
            bodyless,
        };
        let index = register(cx, site)?;
        if kind == K::CONSTRUCTOR {
            let registered = cx.registry.site_by_node.get(&At { file, node }).copied();
            let _ = index;
            cx.registry.constructor_by_class.insert(class_node, registered);
        }
    }
    Ok(())
}

fn statement_entry_sites(cx: &mut Cx, file: u32, path: &str, scope: &Scoped) -> Found<()> {
    let table = cx.table(file);
    let t = &*table;
    let exported = Rc::clone(&cx.registry.exported_by_file[&file]);
    for found in statement_sites(t, scope.statement) {
        let id = reserve(cx, format!("{path}#{}{}", scope.prefix, found.name));
        let named = if t.kind(found.declaration) == K::EXPORT_ASSIGNMENT { None } else { name_of(t, found.declaration) };
        let site = Site {
            id,
            name: found.name,
            kind: "function",
            owner: Some(path.to_string()),
            node: At { file, node: found.node },
            declaration: At { file, node: found.declaration },
            path: path.to_string(),
            exported: scope.is_exported(t, &exported, file, found.declaration),
            anchor: scope.anchor.map(|anchor| At { file, node: anchor }),
            line: line_of(t, named.unwrap_or(found.node)),
            callback: false,
            member: None,
            class_entry: None,
            is_static: false,
            bodyless: false,
        };
        register(cx, site)?;
    }
    let statement = At { file, node: scope.statement };
    if let Some(entry) = cx.registry.type_by_node.get(&statement).copied() {
        if matches!(t.kind(scope.statement), K::CLASS_DECLARATION | K::INTERFACE_DECLARATION) && cx.registry.entries[entry].node == statement {
            class_sites(cx, file, entry, scope.statement)?;
        }
    }
    Ok(())
}

fn path_of(cx: &Cx, file: u32) -> String {
    cx.input.files.iter().find(|(name, _)| name == cx.path(file)).map(|(_, info)| info.path.clone()).unwrap_or_default()
}

pub fn collect_named(cx: &mut Cx, files: &[u32]) -> Found<()> {
    for file in files {
        let path = path_of(cx, *file);
        let table = cx.table(*file);
        for scope in scoped_statements(&table) {
            statement_entry_sites(cx, *file, &path, &scope)?;
        }
    }
    Ok(())
}

fn callee_name(t: T, call: u32) -> String {
    let Some(callee) = expression(t, call).map(|callee| unwrap(t, callee)) else { return "callback".to_string() };
    match t.kind(callee) {
        K::PROPERTY_ACCESS_EXPRESSION => name_of(t, callee).map(|name| own_text(t, name)).unwrap_or_default(),
        K::IDENTIFIER => own_text(t, callee),
        _ => "callback".to_string(),
    }
}

pub fn collect_callbacks(cx: &mut Cx, files: &[u32]) -> Found<()> {
    for file in files {
        let path = path_of(cx, *file);
        let table = cx.table(*file);
        let t = &*table;
        let nodes = depth_first(ROOT, |node| {
            let kind = t.kind(node);
            if is_closure(kind) || is_class_like(kind) || is_type_node(kind) { Vec::new() } else { t.children(node).collect() }
        });
        let mut callbacks: Vec<(String, u32)> = Vec::new();
        for call in nodes.into_iter().filter(|node| t.kind(*node) == K::CALL_EXPRESSION) {
            if target_site(cx, *file, call)?.is_some() {
                continue;
            }
            let name = callee_name(t, call);
            callbacks.extend(t.listed(call, "arguments").into_iter().map(|argument| unwrap(t, argument)).filter(|argument| is_closure(t.kind(*argument))).map(|closure| (name.clone(), closure)));
        }
        let mut counts: HashMap<String, u32> = HashMap::new();
        for (name, closure) in callbacks {
            let ordinal = counts.entry(name.clone()).or_insert(0);
            *ordinal += 1;
            let id = reserve(cx, format!("{path}#{name}@{ordinal}"));
            let at = At { file: *file, node: closure };
            let site = Site { id, name, kind: "function", owner: None, node: at, declaration: at, path: path.clone(), exported: false, anchor: None, line: line_of(t, closure), callback: true, member: None, class_entry: None, is_static: false, bodyless: false };
            register(cx, site)?;
        }
    }
    Ok(())
}
