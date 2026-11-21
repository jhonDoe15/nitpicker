//! How a callable uses its parameters, its owner's fields and the values it reads.
use super::calls::{Scope, accepts_position, is_owner_this, is_value_declaration};
use super::syntax::*;
use super::targets::{symbol_of, target_site};
use super::types::entry_of_symbol;
use super::{At, Cx, Found};
use crate::typescript::types::server::{Symbol, Type};
use crate::typescript::types::tables::kind as K;
use crate::typescript::types::tables::type_flags;
use serde_json::{Value, json};
use std::rc::Rc;

const FORMAT_FLAGS: u32 = 1 | 16384;

fn is_nullish_type(t: T, node: u32) -> bool {
    matches!(t.kind(node), K::UNDEFINED_KEYWORD | K::VOID_KEYWORD) || (t.kind(node) == K::LITERAL_TYPE && t.child(node, "literal").is_some_and(|literal| t.kind(literal) == K::NULL_KEYWORD))
}

fn entry_of_type_node(cx: &mut Cx, at: At) -> Found<Option<usize>> {
    let table = cx.table(at.file);
    let t = &*table;
    let mut pending = vec![at.node];
    let mut kept = Vec::new();
    let mut next = 0;
    while next < pending.len() {
        let node = pending[next];
        next += 1;
        match t.kind(node) {
            K::PARENTHESIZED_TYPE => pending.extend(t.child(node, "type")),
            K::UNION_TYPE => pending.extend(t.listed(node, "types")),
            _ if !is_nullish_type(t, node) => kept.push(node),
            _ => {}
        }
    }
    let [only] = kept.as_slice() else { return Ok(None) };
    if t.kind(*only) != K::TYPE_REFERENCE {
        return Ok(None);
    }
    let Some(name) = t.child(*only, "typeName").and_then(|name| if t.kind(name) == K::QUALIFIED_NAME { t.child(name, "right") } else { Some(name) }) else { return Ok(None) };
    let symbol = cx.symbol(At { file: at.file, node: name })?;
    entry_of_symbol(cx, symbol)
}

fn entry_of_type(cx: &mut Cx, kind: &Type) -> Found<Option<usize>> {
    let Some(plain): Option<Type> = cx.session.ask("getNonNullableType", json!({ "type": kind.id }))? else { return Ok(None) };
    if plain.alias_symbol.is_some() {
        let alias: Option<Symbol> = cx.session.ask("getAliasSymbolOfType", json!({ "objectId": plain.id }))?;
        if let Some(entry) = entry_of_symbol(cx, alias.map(Rc::new))? {
            return Ok(Some(entry));
        }
    }
    let symbol = cx.session.symbol_of_type(&plain)?;
    entry_of_symbol(cx, symbol)
}

pub fn entry_of_node_or_type(cx: &mut Cx, type_node: Option<At>, kind: Option<&Type>) -> Found<Option<usize>> {
    if let Some(node) = type_node {
        if let Some(entry) = entry_of_type_node(cx, node)? {
            return Ok(Some(entry));
        }
    }
    match kind {
        Some(kind) => entry_of_type(cx, kind),
        None => Ok(None),
    }
}

fn without_generics(text: &str) -> String {
    let units: Vec<u16> = text.encode_utf16().collect();
    let mut depth = 0;
    let mut result = String::new();
    for (index, character) in text.chars().enumerate() {
        let after_equals = index > 0 && units.get(index - 1) == Some(&(b'=' as u16));
        if character == '<' {
            depth += 1;
        } else if character == '>' && !after_equals && depth > 0 {
            depth -= 1;
        } else if depth == 0 {
            result.push(character);
        }
    }
    result
}

fn without_undefined(text: &str) -> String {
    let mut result = String::new();
    let mut rest = text;
    while let Some(character) = rest.chars().next() {
        if rest.starts_with("|undefined") || rest.starts_with("undefined|") {
            rest = &rest[10..];
        } else {
            result.push(character);
            rest = &rest[character.len_utf8()..];
        }
    }
    result
}

fn is_space(character: char) -> bool {
    (character.is_whitespace() && character != '\u{85}') || character == '\u{feff}'
}

fn normalized_type_text(cx: &mut Cx, kind: &Type) -> Found<String> {
    let written = without_generics(&cx.type_text(kind, Some(FORMAT_FLAGS))?);
    let text: String = super::text::with_sorted_unions(&written).chars().filter(|character| !is_space(*character)).collect();
    let plain = without_undefined(&text);
    Ok(if plain.is_empty() { "undefined".to_string() } else { plain })
}

fn is_untyped(cx: &mut Cx, kind: &Type) -> Found<bool> {
    Ok(kind.flags & (type_flags::ANY | type_flags::UNKNOWN) != 0 || cx.type_text(kind, None)? == "any[]")
}

/// The project type a parameter has, and the text its type is reported as.
fn parameter_info(cx: &mut Cx, scope: &Scope, parameter: u32) -> Found<(Option<usize>, Option<String>)> {
    let table = cx.table(scope.file);
    let t = &*table;
    let type_node = t.child(parameter, "type").map(|node| At { file: scope.file, node });
    let infers = t.child(parameter, "initializer").is_some() || cx.registry.sites[scope.site].callback;
    if type_node.is_none() && !infers {
        return Ok((None, None));
    }
    let kind: Option<Rc<Type>> = match type_node {
        Some(node) => cx.type_of_node(node)?.map(Rc::new),
        None => cx.type_at(At { file: scope.file, node: parameter })?,
    };
    let Some(kind) = kind else { return Err(format!("no type for a parameter in {}", cx.path(scope.file))) };
    if type_node.is_none() && is_untyped(cx, &kind)? {
        return Ok((None, None));
    }
    let entry = entry_of_node_or_type(cx, type_node, Some(&kind))?;
    let text = match entry {
        Some(entry) => cx.registry.entries[entry].id.clone(),
        None => normalized_type_text(cx, &kind)?,
    };
    Ok((entry, Some(text)))
}

pub fn param_facts(cx: &mut Cx, scope: &Scope) -> Found<Vec<Value>> {
    let table = cx.table(scope.file);
    let t = &*table;
    let mut facts = Vec::new();
    for (index, parameter) in declared_parameters(t, scope.root).into_iter().enumerate() {
        let (_, kind) = parameter_info(cx, scope, parameter)?;
        let name = name_of(t, parameter);
        let plain = name.is_some_and(|name| t.kind(name) == K::IDENTIFIER);
        let mut fact = json!({ "name": if plain { own_text(t, name.unwrap_or(parameter)) } else { format!("arg{index}") } });
        if let Some(kind) = kind {
            fact["type"] = json!(kind);
        }
        if t.child(parameter, "dotDotDotToken").is_some() {
            fact["variadic"] = json!(true);
        }
        if t.child(parameter, "questionToken").is_some() || t.child(parameter, "initializer").is_some() {
            fact["optional"] = json!(true);
        }
        if !plain {
            fact["pattern"] = json!(true);
        }
        facts.push(fact);
    }
    Ok(facts)
}

pub fn declared_return_type(cx: &mut Cx, scope: &Scope) -> Found<Option<String>> {
    let table = cx.table(scope.file);
    let Some(annotation) = table.child(scope.root, "type") else { return Ok(None) };
    let keyword = match table.kind(annotation) {
        K::STRING_KEYWORD => Some("string"),
        K::NUMBER_KEYWORD => Some("number"),
        K::BOOLEAN_KEYWORD => Some("boolean"),
        K::VOID_KEYWORD => Some("void"),
        K::ANY_KEYWORD => Some("any"),
        K::UNKNOWN_KEYWORD => Some("unknown"),
        K::NEVER_KEYWORD => Some("never"),
        K::BIG_INT_KEYWORD => Some("bigint"),
        _ => None,
    };
    if let Some(keyword) = keyword {
        return Ok(Some(keyword.to_string()));
    }
    let at = At { file: scope.file, node: annotation };
    let Some(kind) = cx.type_of_node(at)? else { return Err(format!("no type for a return annotation in {}", cx.path(scope.file))) };
    Ok(Some(match entry_of_node_or_type(cx, Some(at), Some(&kind))? {
        Some(entry) => cx.registry.entries[entry].id.clone(),
        None => normalized_type_text(cx, &kind)?,
    }))
}

fn owner_entry(cx: &Cx, scope: &Scope) -> Option<usize> {
    cx.registry.sites[scope.site].owner.as_ref().and_then(|owner| cx.registry.type_ids.get(owner).copied())
}

/// The field of the callable's own class or module that a node reads or writes.
pub fn own_field_of(cx: &mut Cx, scope: &Scope, node: u32) -> Found<Option<String>> {
    let Some(owner) = owner_entry(cx, scope) else { return Ok(None) };
    let table = cx.table(scope.file);
    let t = &*table;
    if cx.registry.entries[owner].kind == "module" {
        if t.kind(node) != K::IDENTIFIER || !cx.registry.entries[owner].field_names.contains(&own_text(t, node)) {
            return Ok(None);
        }
        let symbol = symbol_of(cx, At { file: scope.file, node })?;
        let declaration = cx.value_declaration(symbol.as_deref())?;
        let is_module_variable = declaration.is_some_and(|declaration| declaration.file == scope.file && t.kind(declaration.node) == K::VARIABLE_DECLARATION && enclosing_closure(t, declaration.node).is_none());
        return Ok(is_module_variable.then(|| own_text(t, node)));
    }
    let is_this_member = is_access(t.kind(node)) && expression(t, node).is_some_and(|base| t.kind(base) == K::THIS_KEYWORD && is_owner_this(cx, scope, base));
    let name = if is_this_member { accessed_name(t, node) } else { None };
    Ok(name.filter(|name| cx.registry.entries[owner].field_names.contains(name)))
}

fn push_unique(names: &mut Vec<String>, name: String) {
    if !names.contains(&name) {
        names.push(name);
    }
}

pub fn own_field_names(cx: &mut Cx, scope: &Scope) -> Found<Vec<String>> {
    let table = cx.table(scope.file);
    let t = &*table;
    let owner = owner_entry(cx, scope);
    let mut names = Vec::new();
    for node in &scope.nodes {
        if let Some(name) = own_field_of(cx, scope, *node)? {
            push_unique(&mut names, name);
        }
        let pattern = (t.kind(*node) == K::VARIABLE_DECLARATION).then(|| name_of(t, *node)).flatten().filter(|name| t.kind(*name) == K::OBJECT_BINDING_PATTERN);
        let initializer = t.child(*node, "initializer").filter(|_| pattern.is_some()).map(|initializer| unwrap_value(t, initializer));
        let is_this_pattern = initializer.is_some_and(|value| t.kind(value) == K::THIS_KEYWORD && is_owner_this(cx, scope, value));
        if let (true, Some(pattern), Some(owner)) = (is_this_pattern, pattern, owner) {
            for element in t.listed(pattern, "elements") {
                let key = t.child(element, "propertyName").or_else(|| name_of(t, element));
                let name = key.map(|key| text(t, key)).unwrap_or_default();
                if cx.registry.entries[owner].field_names.contains(&name) {
                    push_unique(&mut names, name);
                }
            }
        }
    }
    Ok(names)
}

pub fn returned_field(cx: &mut Cx, scope: &Scope) -> Found<Option<String>> {
    let table = cx.table(scope.file);
    let t = &*table;
    let body = t.child(scope.root, "body");
    let returned: Vec<Option<u32>> = match body {
        Some(body) if t.kind(body) == K::BLOCK => scope.nodes.iter().copied().filter(|node| t.kind(*node) == K::RETURN_STATEMENT && enclosing_closure(t, *node) == Some(scope.root)).map(|statement| expression(t, statement)).collect(),
        other => vec![other],
    };
    for value in returned.into_iter().flatten() {
        if let Some(name) = own_field_of(cx, scope, unwrap_value(t, value))? {
            return Ok(Some(name));
        }
    }
    Ok(None)
}

fn pattern_fields(t: T, pattern: u32) -> (Vec<String>, bool) {
    let mut fields = Vec::new();
    let mut opaque = false;
    for element in t.listed(pattern, "elements") {
        let key = t.child(element, "propertyName").or_else(|| name_of(t, element));
        let name = if t.kind(element) == K::BINDING_ELEMENT && t.child(element, "dotDotDotToken").is_none() { key.and_then(|key| static_name(t, key)) } else { None };
        match name {
            Some(name) => fields.push(name),
            None => opaque = true,
        }
    }
    (fields, opaque)
}

struct Uses {
    fields: Vec<String>,
    forwards: Vec<(String, usize)>,
    opaque: bool,
}

fn classify(cx: &mut Cx, scope: &Scope, reference: u32, uses: &mut Uses) -> Found<()> {
    let table = cx.table(scope.file);
    let t = &*table;
    let mut node = reference;
    while let Some(parent) = t.parent(node).filter(|parent| is_wrapper(t.kind(*parent))) {
        node = parent;
    }
    let Some(parent) = t.parent(node) else {
        uses.opaque = true;
        return Ok(());
    };
    let kind = t.kind(parent);
    if is_access(kind) {
        match accessed_name(t, parent).filter(|_| expression(t, parent) == Some(node)) {
            Some(name) => push_unique(&mut uses.fields, name),
            None => uses.opaque = true,
        }
    } else if kind == K::VARIABLE_DECLARATION && t.child(parent, "initializer") == Some(node) && name_of(t, parent).is_some_and(|name| t.kind(name) == K::OBJECT_BINDING_PATTERN) {
        let (fields, opaque) = pattern_fields(t, name_of(t, parent).unwrap_or(parent));
        for field in fields {
            push_unique(&mut uses.fields, field);
        }
        uses.opaque = uses.opaque || opaque;
    } else if matches!(kind, K::CALL_EXPRESSION | K::NEW_EXPRESSION) {
        let arguments = t.listed(parent, "arguments");
        let site = target_site(cx, scope.file, parent)?;
        let position = arguments.iter().position(|argument| *argument == node);
        let spread = arguments.iter().any(|argument| t.kind(*argument) == K::SPREAD_ELEMENT);
        match (site, position) {
            (Some(site), Some(position)) if !spread && accepts_position(cx, site, position) => {
                let forward = (cx.registry.sites[site].id.clone(), position);
                match uses.forwards.iter_mut().find(|known| **known == forward) {
                    Some(known) => *known = forward,
                    None => uses.forwards.push(forward),
                }
            }
            _ => uses.opaque = true,
        }
    } else {
        uses.opaque = true;
    }
    Ok(())
}

fn uses_of(cx: &mut Cx, scope: &Scope, parameter: u32) -> Found<Uses> {
    let table = cx.table(scope.file);
    let t = &*table;
    let mut uses = Uses { fields: Vec::new(), forwards: Vec::new(), opaque: false };
    let Some(name) = name_of(t, parameter) else { return Ok(uses) };
    if t.kind(name) == K::OBJECT_BINDING_PATTERN {
        (uses.fields, uses.opaque) = pattern_fields(t, name);
        return Ok(uses);
    }
    if let Some(symbol) = cx.symbol(At { file: scope.file, node: name })? {
        let declared_name = cx.value_declaration(Some(&symbol))?.and_then(|declaration| name_of(&cx.table(declaration.file), declaration.node).map(|node| At { file: declaration.file, node }));
        for node in &scope.nodes {
            let is_reference = t.kind(*node) == K::IDENTIFIER
                && t.text(*node).as_deref() == Some(symbol.name.as_str())
                && symbol_of(cx, At { file: scope.file, node: *node })?.is_some_and(|found| found.id == symbol.id)
                && declared_name != Some(At { file: scope.file, node: *node });
            if is_reference {
                classify(cx, scope, *node, &mut uses)?;
                uses.opaque = uses.opaque || enclosing_closure(t, *node) != Some(scope.root);
            }
        }
    }
    let is_property = t.parent(parameter).is_some_and(|parent| t.kind(parent) == K::CONSTRUCTOR) && [K::PUBLIC_KEYWORD, K::PRIVATE_KEYWORD, K::PROTECTED_KEYWORD, K::READONLY_KEYWORD].iter().any(|modifier| has_modifier(t, parameter, *modifier));
    uses.opaque = uses.opaque || is_property;
    Ok(uses)
}

pub fn param_use_facts(cx: &mut Cx, scope: &Scope) -> Found<Vec<Value>> {
    let table = cx.table(scope.file);
    let mut facts = Vec::new();
    for (index, parameter) in declared_parameters(&table, scope.root).into_iter().enumerate() {
        let (entry, _) = parameter_info(cx, scope, parameter)?;
        if !entry.is_some_and(|entry| matches!(cx.registry.entries[entry].kind, "class" | "data" | "interface")) {
            continue;
        }
        let uses = uses_of(cx, scope, parameter)?;
        let forwards: Vec<Value> = uses.forwards.iter().map(|(target, position)| json!({ "target": target, "position": position })).collect();
        let mut fact = json!({ "param": index, "fields": uses.fields, "forwards": forwards });
        if uses.opaque {
            fact["opaque"] = json!(true);
        }
        facts.push(fact);
    }
    Ok(facts)
}

fn is_condition_of(t: T, parent: u32, child: u32) -> bool {
    match t.kind(parent) {
        K::IF_STATEMENT | K::WHILE_STATEMENT | K::DO_STATEMENT | K::SWITCH_STATEMENT => expression(t, parent) == Some(child),
        K::FOR_STATEMENT | K::CONDITIONAL_EXPRESSION => t.child(parent, "condition") == Some(child),
        K::BINARY_EXPRESSION => matches!(operator_token(t, parent), K::AMPERSAND_AMPERSAND_TOKEN | K::BAR_BAR_TOKEN) && t.child(parent, "left") == Some(child),
        _ => false,
    }
}

fn is_decided(t: T, access: u32) -> bool {
    let mut child = access;
    loop {
        let Some(parent) = t.parent(child) else { return false };
        let kind = t.kind(parent);
        if is_closure(kind) {
            return false;
        }
        if is_condition_of(t, parent, child) {
            return true;
        }
        if is_statement(kind) {
            return false;
        }
        child = parent;
    }
}

#[derive(PartialEq)]
enum Key {
    Symbol(u64),
    Field(String),
}

struct ReadValue {
    key: Key,
    kind: String,
    fields: Vec<String>,
    decided: Vec<String>,
    line: u32,
}

fn read_of(cx: &mut Cx, scope: &Scope, node: u32) -> Found<Option<(Key, String, String, bool, u32)>> {
    let table = cx.table(scope.file);
    let t = &*table;
    let Some(name) = accessed_name(t, node).filter(|name| cx.registry.field_names.contains(name)) else { return Ok(None) };
    let Some(base) = expression(t, node).map(|base| unwrap(t, base)) else { return Ok(None) };
    if t.kind(base) == K::THIS_KEYWORD || is_plain_assignment(t, node) {
        return Ok(None);
    }
    let value: Option<(Key, Option<At>)> = if t.kind(base) == K::IDENTIFIER {
        let symbol = symbol_of(cx, At { file: scope.file, node: base })?;
        let declaration = cx.value_declaration(symbol.as_deref())?;
        let local = declaration.filter(|declaration| {
            declaration.file == scope.file && is_value_declaration(t.kind(declaration.node)) && t.pos(declaration.node) >= t.pos(scope.root) && t.end(declaration.node) <= t.end(scope.root)
        });
        symbol.zip(local).map(|(symbol, declaration)| (Key::Symbol(symbol.id), Some(declaration)))
    } else if t.kind(base) == K::PROPERTY_ACCESS_EXPRESSION {
        match own_field_of(cx, scope, base)? {
            Some(field) if !field.is_empty() => {
                let symbol = match name_of(t, base) {
                    Some(name) => cx.symbol(At { file: scope.file, node: name })?,
                    None => None,
                };
                Some((Key::Field(format!("this.{field}")), cx.value_declaration(symbol.as_deref())?))
            }
            _ => return Ok(None),
        }
    } else {
        return Ok(None);
    };
    let Some((key, declaration)) = value else { return Ok(None) };
    let type_node = declaration.and_then(|declaration| declared_type_of(&cx.table(declaration.file), declaration.node).map(|node| At { file: declaration.file, node }));
    let kind = cx.type_at(At { file: scope.file, node: base })?;
    let entry = entry_of_node_or_type(cx, type_node, kind.as_deref())?;
    Ok(entry.filter(|entry| matches!(cx.registry.entries[*entry].kind, "class" | "data")).map(|entry| (key, cx.registry.entries[entry].id.clone(), name, is_decided(t, node), line_of(t, node))))
}

pub fn read_facts(cx: &mut Cx, scope: &Scope) -> Found<Vec<Value>> {
    let table = cx.table(scope.file);
    let mut values: Vec<ReadValue> = Vec::new();
    for node in &scope.nodes {
        if !is_access(table.kind(*node)) {
            continue;
        }
        let Some((key, kind, field, decided, line)) = read_of(cx, scope, *node)? else { continue };
        let index = match values.iter().position(|known| known.key == key) {
            Some(index) => index,
            None => {
                values.push(ReadValue { key, kind, fields: Vec::new(), decided: Vec::new(), line });
                values.len() - 1
            }
        };
        if decided {
            push_unique(&mut values[index].decided, field.clone());
        }
        push_unique(&mut values[index].fields, field);
    }
    Ok(values
        .into_iter()
        .map(|value| {
            let mut fact = json!({ "type": value.kind, "fields": value.fields, "line": value.line });
            if !value.decided.is_empty() {
                fact["decided"] = json!(value.decided);
            }
            fact
        })
        .collect())
}
