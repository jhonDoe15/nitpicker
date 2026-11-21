//! Which callable of the project a call, a tag or a name stands for.
use super::syntax::*;
use super::{At, Cx, Found};
use crate::typescript::types::nodes::ROOT;
use crate::typescript::types::server::Symbol;
use crate::typescript::types::tables::kind as K;
use serde_json::json;
use std::collections::HashSet;
use std::rc::Rc;

/// The symbol of a name; for the name of `{ name }` the variable it reads, not the property it writes.
pub fn symbol_of(cx: &mut Cx, at: At) -> Found<Option<Rc<Symbol>>> {
    let table = cx.table(at.file);
    let shorthand = table.parent(at.node).filter(|parent| table.kind(*parent) == K::SHORTHAND_PROPERTY_ASSIGNMENT && name_of(&table, *parent) == Some(at.node));
    match shorthand {
        Some(parent) => {
            let found: Option<Symbol> = cx.session.ask("getShorthandAssignmentValueSymbol", json!({ "location": cx.handle(At { file: at.file, node: parent }) }))?;
            Ok(found.map(Rc::new))
        }
        None => cx.symbol(at),
    }
}

fn declared_function(cx: &Cx, declaration: At) -> At {
    let table = cx.table(declaration.file);
    let value = match table.kind(declaration.node) {
        K::VARIABLE_DECLARATION | K::PROPERTY_DECLARATION => wrapped_function(&table, table.child(declaration.node, "initializer")),
        K::EXPORT_ASSIGNMENT => wrapped_function(&table, expression(&table, declaration.node)),
        _ => None,
    };
    value.map_or(declaration, |node| At { file: declaration.file, node })
}

fn site_of_symbol(cx: &mut Cx, symbol: Option<Rc<Symbol>>) -> Found<Option<usize>> {
    let target = cx.follow(symbol)?;
    let mut found: Vec<usize> = Vec::new();
    for declaration in cx.declarations(target.as_deref())? {
        if let Some(site) = cx.registry.site_by_node.get(&declared_function(cx, declaration)).copied() {
            if !found.contains(&site) {
                found.push(site);
            }
        }
    }
    Ok(if found.len() == 1 { found.first().copied() } else { None })
}

/// A disk path with a root (`/a`, `\\a`, `c:/a`, `c:`, `c%3a/a`), as the compiler's `isRootedDiskPath` reads it.
fn is_rooted(specifier: &str) -> bool {
    let bytes = specifier.as_bytes();
    if matches!(bytes.first(), Some(b'/' | b'\\')) {
        return true;
    }
    if !bytes.first().is_some_and(u8::is_ascii_alphabetic) {
        return false;
    }
    let after_volume = if bytes.get(1) == Some(&b':') {
        2
    } else if bytes.get(1) == Some(&b'%') && bytes.get(2) == Some(&b'3') && matches!(bytes.get(3), Some(b'a' | b'A')) {
        4
    } else {
        return false;
    };
    matches!(bytes.get(after_volume), None | Some(b'/' | b'\\'))
}

fn may_be_project_module(cx: &Cx, specifier: &str) -> bool {
    let relative = [".", ".."].contains(&specifier) || ["./", "../", ".\\", "..\\"].iter().any(|start| specifier.starts_with(start));
    cx.input.any_specifier || relative || is_rooted(specifier) || cx.input.path_prefixes.iter().any(|prefix| specifier.starts_with(prefix.as_str()))
}

fn imported_names(cx: &mut Cx, file: u32) -> Found<Rc<HashSet<String>>> {
    if let Some(known) = cx.registry.imports_by_file.get(&file) {
        return Ok(Rc::clone(known));
    }
    let table = cx.table(file);
    let t = &*table;
    let mut names = HashSet::new();
    for statement in t.listed(ROOT, "statements") {
        if t.kind(statement) != K::IMPORT_DECLARATION {
            continue;
        }
        let Some(specifier) = t.child(statement, "moduleSpecifier").filter(|specifier| t.kind(*specifier) == K::STRING_LITERAL) else { continue };
        if !may_be_project_module(cx, &own_text(t, specifier)) {
            continue;
        }
        let Some(clause) = t.child(statement, "importClause") else { continue };
        let named = t.child(clause, "namedBindings").filter(|named| t.kind(*named) == K::NAMED_IMPORTS);
        let elements = named.map(|named| t.listed(named, "elements")).unwrap_or_default();
        let bindings = name_of(t, clause).into_iter().chain(elements.into_iter().filter_map(|element| name_of(t, element)));
        for binding in bindings {
            let symbol = cx.symbol(At { file, node: binding })?;
            let target = cx.follow(symbol)?;
            let mut resolves = false;
            for declaration in cx.declarations(target.as_deref())? {
                resolves = resolves || cx.registry.site_by_node.contains_key(&declared_function(cx, declaration)) || cx.registry.constructor_by_class.contains_key(&declaration);
            }
            if resolves {
                names.insert(own_text(t, binding));
            }
        }
    }
    let names = Rc::new(names);
    cx.registry.imports_by_file.insert(file, Rc::clone(&names));
    Ok(names)
}

fn may_be_project(cx: &mut Cx, file: u32, name: &str) -> Found<bool> {
    Ok(cx.registry.site_names.contains(name) || cx.registry.class_names.contains(name) || imported_names(cx, file)?.contains(name))
}

fn symbol_at(cx: &mut Cx, file: u32, target: u32) -> Found<Option<Rc<Symbol>>> {
    let table = cx.table(file);
    let t = &*table;
    let value = unwrap(t, target);
    let node = if t.kind(value) == K::PROPERTY_ACCESS_EXPRESSION { name_of(t, value).unwrap_or(value) } else { value };
    let is_name = matches!(t.kind(node), K::IDENTIFIER | K::PRIVATE_IDENTIFIER);
    let is_local = t.kind(target) == K::IDENTIFIER && !may_be_project(cx, file, &own_text(t, target))?;
    if is_name && !is_local { cx.symbol(At { file, node }) } else { Ok(None) }
}

fn constructor_site(cx: &mut Cx, class: Option<Rc<Symbol>>) -> Found<Option<usize>> {
    let target = cx.follow(class)?;
    for declaration in cx.declarations(target.as_deref())? {
        if let Some(Some(site)) = cx.registry.constructor_by_class.get(&declaration) {
            return Ok(Some(*site));
        }
    }
    Ok(None)
}

fn super_site(cx: &mut Cx, file: u32, call: u32) -> Found<Option<usize>> {
    let table = cx.table(file);
    let t = &*table;
    let class = std::iter::successors(t.parent(call), |node| t.parent(*node)).find(|node| is_class_like(t.kind(*node)));
    let base = class.and_then(|class| heritage_clauses(t, class).into_iter().find(|(implements, _)| !implements)).and_then(|(_, types)| types.first().copied());
    match base.and_then(|base| expression(t, base)) {
        Some(target) => {
            let symbol = symbol_at(cx, file, target)?;
            constructor_site(cx, symbol)
        }
        None => Ok(None),
    }
}

/// The site a call, a `new` or a JSX tag runs.
pub fn target_site(cx: &mut Cx, file: u32, node: u32) -> Found<Option<usize>> {
    let table = cx.table(file);
    let t = &*table;
    match t.kind(node) {
        K::NEW_EXPRESSION => {
            let Some(target) = expression(t, node) else { return Ok(None) };
            let symbol = symbol_at(cx, file, target)?;
            constructor_site(cx, symbol)
        }
        K::JSX_OPENING_ELEMENT | K::JSX_SELF_CLOSING_ELEMENT => {
            let Some(tag) = t.child(node, "tagName") else { return Ok(None) };
            let symbol = symbol_at(cx, file, tag)?;
            site_of_symbol(cx, symbol)
        }
        _ => {
            let Some(callee) = expression(t, node).map(|callee| unwrap(t, callee)) else { return Ok(None) };
            if t.kind(callee) == K::SUPER_KEYWORD {
                return super_site(cx, file, node);
            }
            if t.kind(callee) == K::PROPERTY_ACCESS_EXPRESSION && !name_of(t, callee).is_some_and(|name| cx.registry.site_names.contains(&own_text(t, name))) {
                return Ok(None);
            }
            let symbol = symbol_at(cx, file, callee)?;
            site_of_symbol(cx, symbol)
        }
    }
}

/// The site an identifier or a property access names as a value.
pub fn value_site(cx: &mut Cx, file: u32, node: u32) -> Found<Option<usize>> {
    let table = cx.table(file);
    let t = &*table;
    if t.kind(node) == K::IDENTIFIER {
        if !may_be_project(cx, file, &own_text(t, node))? {
            return Ok(None);
        }
        let symbol = symbol_of(cx, At { file, node })?;
        return site_of_symbol(cx, symbol);
    }
    match name_of(t, node).filter(|name| cx.registry.site_names.contains(&own_text(t, *name))) {
        Some(name) => {
            let symbol = cx.symbol(At { file, node: name })?;
            site_of_symbol(cx, symbol)
        }
        None => Ok(None),
    }
}
