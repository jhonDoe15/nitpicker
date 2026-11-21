//! What a callable does: the project callables it calls and names, and the fact that describes it.
use super::decisions::decision_facts;
use super::syntax::*;
use super::targets::{symbol_of, target_site, value_site};
use super::uses::{own_field_names, param_facts, param_use_facts, read_facts, returned_field, declared_return_type};
use super::{At, Cx, Found};
use crate::typescript::types::nodes::ROOT;
use crate::typescript::types::server::Symbol;
use crate::typescript::types::tables::kind as K;
use crate::typescript::types::tables::node_flags;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::rc::Rc;

/// One callable while its facts are collected.
pub struct Scope {
    pub site: usize,
    pub file: u32,
    pub root: u32,
    pub nodes: Vec<u32>,
    pub keys: HashMap<u64, String>,
    pub name_counts: HashMap<String, u32>,
}

pub fn is_owner_this(cx: &Cx, scope: &Scope, expression: u32) -> bool {
    let table = cx.table(scope.file);
    match this_owner(&table, expression) {
        Some(owner) => owner == scope.root,
        None => table.kind(scope.root) == K::ARROW_FUNCTION,
    }
}

pub fn is_value_declaration(kind: u32) -> bool {
    matches!(kind, K::PARAMETER | K::VARIABLE_DECLARATION | K::BINDING_ELEMENT)
}

/// A name for a local of this callable, the same for every use of it.
pub fn local_key(cx: &mut Cx, scope: &mut Scope, identifier: u32) -> Found<Option<String>> {
    let Some(symbol) = cx.symbol(At { file: scope.file, node: identifier })? else { return Ok(None) };
    let Some(declaration) = cx.value_declaration(Some(&symbol))? else { return Ok(None) };
    if !is_value_declaration(cx.kind(declaration)) || declaration.file != scope.file {
        return Ok(None);
    }
    if !scope.keys.contains_key(&symbol.id) {
        let seen = scope.name_counts.entry(symbol.name.clone()).or_insert(0);
        *seen += 1;
        let key = if *seen == 1 { symbol.name.clone() } else { format!("{}#{}", symbol.name, *seen) };
        scope.keys.insert(symbol.id, key);
    }
    Ok(scope.keys.get(&symbol.id).cloned())
}

fn receiver_key(cx: &mut Cx, scope: &mut Scope, target: u32) -> Found<Option<String>> {
    let table = cx.table(scope.file);
    let t = &*table;
    let value = unwrap(t, target);
    match t.kind(value) {
        K::THIS_KEYWORD | K::SUPER_KEYWORD => Ok(is_owner_this(cx, scope, value).then(|| "this".to_string())),
        K::IDENTIFIER => local_key(cx, scope, value),
        K::PROPERTY_ACCESS_EXPRESSION => {
            let own = expression(t, value).is_some_and(|base| t.kind(base) == K::THIS_KEYWORD && is_owner_this(cx, scope, base));
            Ok(own.then(|| format!("this.{}", name_of(t, value).map(|name| own_text(t, name)).unwrap_or_default())))
        }
        _ => Ok(None),
    }
}

fn callee_receiver(cx: &mut Cx, scope: &mut Scope, node: u32) -> Found<Option<String>> {
    let table = cx.table(scope.file);
    let t = &*table;
    let base = match t.kind(node) {
        K::PROPERTY_ACCESS_EXPRESSION => expression(t, node),
        K::CALL_EXPRESSION => expression(t, node).map(|callee| unwrap(t, callee)).filter(|callee| is_access(t.kind(*callee))).and_then(|callee| expression(t, callee)),
        _ => None,
    };
    match base {
        Some(base) => receiver_key(cx, scope, base),
        None => Ok(None),
    }
}

fn call_line(t: T, node: u32) -> u32 {
    match t.kind(node) {
        K::PROPERTY_ACCESS_EXPRESSION => line_of(t, name_of(t, node).unwrap_or(node)),
        K::CALL_EXPRESSION => {
            let callee = expression(t, node).map_or(node, |callee| unwrap(t, callee));
            line_of(t, if t.kind(callee) == K::PROPERTY_ACCESS_EXPRESSION { name_of(t, callee).unwrap_or(callee) } else { callee })
        }
        K::NEW_EXPRESSION => line_of(t, node),
        _ => line_of(t, t.child(node, "tagName").unwrap_or(node)),
    }
}

fn is_in_finally(t: T, node: u32, root: u32) -> bool {
    let mut current = Some(node);
    while let Some(at) = current {
        if at != root && t.parent(at).is_some_and(|parent| t.kind(parent) == K::TRY_STATEMENT && t.child(parent, "finallyBlock") == Some(at)) {
            return true;
        }
        current = if at == root || is_closure(t.kind(at)) { None } else { t.parent(at) };
    }
    false
}

fn outermost_wrapper(t: T, node: u32) -> u32 {
    let mut current = node;
    while let Some(parent) = t.parent(current).filter(|parent| is_value_wrapper(t, *parent, current)) {
        current = parent;
    }
    current
}

const MUTATING: &[&str] = &["push", "add", "put", "set", "delete", "remove", "clear", "sort", "splice", "append", "extend", "update", "pop", "shift", "unshift", "reverse", "fill", "copyWithin"];

fn mutation_of_value(t: T, node: u32) -> Option<String> {
    let outer = outermost_wrapper(t, node);
    let access = t.parent(outer)?;
    if t.kind(access) == K::PROPERTY_ACCESS_EXPRESSION && expression(t, access) == Some(outer) {
        let name = name_of(t, access).map(|name| own_text(t, name)).unwrap_or_default();
        let called = t.parent(access).is_some_and(|call| t.kind(call) == K::CALL_EXPRESSION && expression(t, call) == Some(access));
        if called && MUTATING.contains(&name.as_str()) {
            return Some(name);
        }
    }
    let mut last = outer;
    let mut steps = 0;
    while let Some(parent) = t.parent(last).filter(|parent| is_access(t.kind(*parent)) && expression(t, *parent) == Some(last)) {
        last = parent;
        steps += 1;
    }
    (steps > 0 && is_write(t, last)).then(|| "assign".to_string())
}

fn uses_of(cx: &mut Cx, scope: &Scope, symbol: &Symbol) -> Found<Vec<u32>> {
    let table = cx.table(scope.file);
    let mut uses = Vec::new();
    for node in &scope.nodes {
        if table.kind(*node) == K::IDENTIFIER && table.text(*node).as_deref() == Some(symbol.name.as_str()) && symbol_of(cx, At { file: scope.file, node: *node })?.is_some_and(|found| found.id == symbol.id) {
            uses.push(*node);
        }
    }
    Ok(uses)
}

fn local_mutation(cx: &mut Cx, scope: &Scope, declaration: u32) -> Found<Option<String>> {
    let table = cx.table(scope.file);
    let t = &*table;
    let Some(name) = name_of(t, declaration) else { return Ok(None) };
    let Some(symbol) = cx.symbol(At { file: scope.file, node: name })? else { return Ok(None) };
    let uses = uses_of(cx, scope, &symbol)?;
    if uses.iter().any(|node| is_write(t, *node)) {
        return Ok(None);
    }
    Ok(uses.into_iter().filter(|node| *node != name).find_map(|node| mutation_of_value(t, node)))
}

fn mutation_of_call(cx: &mut Cx, scope: &Scope, call: u32) -> Found<Option<String>> {
    let table = cx.table(scope.file);
    let t = &*table;
    if let Some(direct) = mutation_of_value(t, call) {
        return Ok(Some(direct));
    }
    let outer = outermost_wrapper(t, call);
    let holder = t.parent(outer).filter(|holder| t.kind(*holder) == K::VARIABLE_DECLARATION && t.child(*holder, "initializer") == Some(outer) && name_of(t, *holder).is_some_and(|name| t.kind(name) == K::IDENTIFIER));
    match holder {
        Some(holder) => local_mutation(cx, scope, holder),
        None => Ok(None),
    }
}

fn arm_of(t: T, node: u32) -> Option<bool> {
    let parent = t.parent(node)?;
    let (first, second) = match t.kind(parent) {
        K::IF_STATEMENT => (t.child(parent, "thenStatement"), t.child(parent, "elseStatement")),
        K::CONDITIONAL_EXPRESSION => (t.child(parent, "whenTrue"), t.child(parent, "whenFalse")),
        _ => return None,
    };
    if first == Some(node) { Some(true) } else if second == Some(node) { Some(false) } else { None }
}

fn branches_of(t: T, scope: &Scope, node: u32) -> Vec<String> {
    let mut arms = Vec::new();
    let mut current = node;
    while current != scope.root {
        if let Some(then) = arm_of(t, current) {
            arms.push((current, then));
        }
        match t.parent(current) {
            Some(parent) => current = parent,
            None => break,
        }
    }
    if arms.is_empty() {
        return Vec::new();
    }
    let conditionals: Vec<u32> = scope.nodes.iter().copied().filter(|node| matches!(t.kind(*node), K::IF_STATEMENT | K::CONDITIONAL_EXPRESSION)).collect();
    arms.into_iter()
        .rev()
        .map(|(arm, then)| {
            let index = t.parent(arm).and_then(|parent| conditionals.iter().position(|node| *node == parent)).map_or(-1, |index| index as i64);
            format!("{index}:{}", if then { "then" } else { "else" })
        })
        .collect()
}

fn has_instance_receiver(cx: &Cx, site: usize) -> bool {
    let site = &cx.registry.sites[site];
    site.member.is_some_and(|member| !site.is_static && cx.table(site.node.file).kind(member) != K::CONSTRUCTOR)
}

fn call_fact(cx: &mut Cx, scope: &mut Scope, node: u32, target: usize) -> Found<Value> {
    let table = cx.table(scope.file);
    let t = &*table;
    let receiver = if has_instance_receiver(cx, target) { callee_receiver(cx, scope, node)? } else { None };
    let is_value = matches!(t.kind(node), K::CALL_EXPRESSION | K::PROPERTY_ACCESS_EXPRESSION);
    let mutation = if is_value { mutation_of_call(cx, scope, node)? } else { None };
    let branch = branches_of(t, scope, node);
    let mut fact = json!({ "target": cx.registry.sites[target].id, "line": call_line(t, node) });
    if let Some(receiver) = receiver {
        fact["receiver"] = json!(receiver);
    }
    if is_in_finally(t, node, scope.root) {
        fact["cleanup"] = json!(true);
    }
    if !branch.is_empty() {
        fact["branch"] = json!(branch);
    }
    if let Some(mutation) = mutation {
        fact["mutation"] = json!(mutation);
    }
    Ok(fact)
}

/// `await using`: the flags of `using` and of `const` together.
const AWAIT_USING: u32 = node_flags::USING | node_flags::CONST;

fn using_calls(cx: &mut Cx, scope: &mut Scope) -> Found<Vec<(u32, Value)>> {
    let table = cx.table(scope.file);
    let t = &*table;
    let mut calls = Vec::new();
    let lists: Vec<u32> = scope.nodes.iter().copied().filter(|node| t.kind(*node) == K::VARIABLE_DECLARATION_LIST && t.flags(*node) & node_flags::USING != 0).collect();
    for declaration in lists.into_iter().flat_map(|list| t.listed(list, "declarations")) {
        let Some(name) = name_of(t, declaration).filter(|name| t.kind(*name) == K::IDENTIFIER) else { continue };
        let Some(kind) = cx.type_at(At { file: scope.file, node: name })? else { continue };
        let awaited = t.parent(declaration).is_some_and(|list| t.flags(list) & AWAIT_USING == AWAIT_USING);
        let hooks = if awaited { ["__@asyncDispose@", "__@dispose@"] } else { ["__@dispose@", "__@asyncDispose@"] };
        let properties = cx.properties(&kind)?;
        let property = hooks.iter().find_map(|hook| properties.iter().find(|property| property.name.starts_with(hook)));
        let Some(method) = cx.value_declaration(property)? else { continue };
        let Some(site) = cx.registry.site_by_node.get(&method).copied() else { continue };
        let receiver = local_key(cx, scope, name)?;
        let block = t.parent(declaration).and_then(|list| t.parent(list)).and_then(|statement| t.parent(statement)).ok_or("a using declaration outside a block")?;
        let mut fact = json!({ "target": cx.registry.sites[site].id, "line": line_of(t, declaration), "cleanup": true });
        if let Some(receiver) = receiver {
            fact["receiver"] = json!(receiver);
        }
        calls.push((t.end(block), fact));
    }
    Ok(calls)
}

fn is_callee(t: T, node: u32) -> bool {
    let mut value = node;
    while let Some(parent) = t.parent(value).filter(|parent| is_wrapper(t.kind(*parent))) {
        value = parent;
    }
    t.parent(value).is_some_and(|parent| matches!(t.kind(parent), K::CALL_EXPRESSION | K::NEW_EXPRESSION | K::DECORATOR) && expression(t, parent) == Some(value))
}

fn is_call_node(kind: u32) -> bool {
    matches!(kind, K::CALL_EXPRESSION | K::NEW_EXPRESSION | K::JSX_OPENING_ELEMENT | K::JSX_SELF_CLOSING_ELEMENT)
}

fn collect_calls(cx: &mut Cx, scope: &mut Scope) -> Found<Vec<Value>> {
    let table = cx.table(scope.file);
    let t = &*table;
    let mut calls: Vec<(u32, Value)> = Vec::new();
    for node in scope.nodes.clone() {
        let kind = t.kind(node);
        let site = if is_call_node(kind) {
            target_site(cx, scope.file, node)?
        } else if kind == K::PROPERTY_ACCESS_EXPRESSION && !is_write(t, node) && !is_callee(t, node) {
            value_site(cx, scope.file, node)?.filter(|site| cx.registry.sites[*site].kind == "accessor")
        } else {
            None
        };
        if let Some(site) = site {
            calls.push((t.end(node), call_fact(cx, scope, node, site)?));
        }
    }
    calls.extend(using_calls(cx, scope)?);
    calls.sort_by_key(|(order, _)| *order);
    Ok(calls.into_iter().map(|(_, fact)| fact).collect())
}

fn is_name_position(t: T, node: u32) -> bool {
    let Some(parent) = t.parent(node) else { return false };
    match t.kind(parent) {
        K::SHORTHAND_PROPERTY_ASSIGNMENT => false,
        K::PROPERTY_ACCESS_EXPRESSION => name_of(t, parent) == Some(node),
        K::QUALIFIED_NAME => true,
        K::IMPORT_SPECIFIER | K::EXPORT_SPECIFIER | K::IMPORT_CLAUSE | K::NAMESPACE_IMPORT | K::LABELED_STATEMENT | K::BREAK_STATEMENT | K::CONTINUE_STATEMENT => true,
        _ => name_of(t, parent) == Some(node),
    }
}

fn is_value_use(t: T, node: u32) -> bool {
    if t.kind(node) == K::IDENTIFIER && is_name_position(t, node) {
        return false;
    }
    let mut value = node;
    while let Some(parent) = t.parent(value).filter(|parent| is_wrapper(t.kind(*parent)) && expression(t, *parent) == Some(value)) {
        value = parent;
    }
    let Some(parent) = t.parent(value) else { return true };
    let kind = t.kind(parent);
    if kind == K::PROPERTY_ACCESS_EXPRESSION && expression(t, parent) == Some(value) {
        return matches!(name_of(t, parent).map(|name| own_text(t, name)).as_deref(), Some("call" | "apply" | "bind"));
    }
    if kind == K::ELEMENT_ACCESS_EXPRESSION && expression(t, parent) == Some(value) {
        return false;
    }
    let called = (matches!(kind, K::CALL_EXPRESSION | K::NEW_EXPRESSION | K::DECORATOR) && expression(t, parent) == Some(value)) || (kind == K::TAGGED_TEMPLATE_EXPRESSION && t.child(parent, "tag") == Some(value));
    let operand = match kind {
        K::BINARY_EXPRESSION => {
            let operator = operator_token(t, parent);
            matches!(operator, K::EQUALS_EQUALS_EQUALS_TOKEN | K::EXCLAMATION_EQUALS_EQUALS_TOKEN | K::EQUALS_EQUALS_TOKEN | K::EXCLAMATION_EQUALS_TOKEN | K::INSTANCE_OF_KEYWORD) || (t.child(parent, "left") == Some(value) && is_assignment_operator(operator))
        }
        K::TYPE_OF_EXPRESSION | K::DELETE_EXPRESSION => true,
        _ => false,
    };
    !(called || operand)
}

fn value_references(cx: &mut Cx, file: u32, nodes: &[u32]) -> Found<Vec<usize>> {
    let table = cx.table(file);
    let mut sites = Vec::new();
    for node in nodes {
        if matches!(table.kind(*node), K::IDENTIFIER | K::PROPERTY_ACCESS_EXPRESSION) && is_value_use(&table, *node) {
            sites.extend(value_site(cx, file, *node)?);
        }
    }
    Ok(sites)
}

fn is_module_constant(cx: &Cx, declaration: At) -> bool {
    let table = cx.table(declaration.file);
    let t = &*table;
    if t.kind(declaration.node) != K::VARIABLE_DECLARATION {
        return false;
    }
    let Some(list) = t.parent(declaration.node) else { return false };
    let statement = t.parent(list);
    t.flags(list) & node_flags::CONST != 0
        && statement.is_some_and(|statement| t.kind(statement) == K::VARIABLE_STATEMENT && t.parent(statement) == Some(ROOT))
        && cx.registry.owned.contains(&declaration.file)
        && t.child(declaration.node, "initializer").is_some_and(|initializer| wrapped_function(t, Some(initializer)).is_none())
}

fn held_references(cx: &mut Cx, file: u32, nodes: &[u32]) -> Found<Vec<usize>> {
    let table = cx.table(file);
    let t = &*table;
    let mut sites = Vec::new();
    for node in nodes {
        if t.kind(*node) != K::IDENTIFIER || !cx.registry.constant_names.contains(&own_text(t, *node)) || is_name_position(t, *node) {
            continue;
        }
        let symbol = symbol_of(cx, At { file, node: *node })?;
        let Some(declaration) = cx.value_declaration(symbol.as_deref())?.filter(|declaration| is_module_constant(cx, *declaration)) else { continue };
        let known = match cx.registry.held_by_constant.get(&declaration) {
            Some(known) => Rc::clone(known),
            None => {
                let outside = outside_closures(&cx.table(declaration.file), declaration.node);
                let references = Rc::new(value_references(cx, declaration.file, &outside)?);
                cx.registry.held_by_constant.insert(declaration, Rc::clone(&references));
                references
            }
        };
        sites.extend(known.iter().copied());
    }
    Ok(sites)
}

fn unique_ids(cx: &Cx, sites: Vec<usize>, own: Option<usize>) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    for site in sites {
        let id = &cx.registry.sites[site].id;
        if !ids.contains(id) {
            ids.push(id.clone());
        }
    }
    let own = own.map(|own| cx.registry.sites[own].id.clone());
    ids.into_iter().filter(|id| Some(id) != own.as_ref()).collect()
}

pub fn constant_names_of(t: T) -> Vec<String> {
    t.listed(ROOT, "statements")
        .into_iter()
        .filter(|statement| t.kind(*statement) == K::VARIABLE_STATEMENT)
        .filter_map(|statement| t.child(statement, "declarationList"))
        .filter(|list| t.flags(*list) & node_flags::CONST != 0)
        .flat_map(|list| t.listed(list, "declarations"))
        .filter_map(|declaration| name_of(t, declaration).filter(|name| t.kind(*name) == K::IDENTIFIER).map(|name| own_text(t, name)))
        .collect()
}

pub fn module_references(cx: &mut Cx, entry: usize) -> Found<Vec<String>> {
    let file = cx.registry.entries[entry].node.file;
    let table = cx.table(file);
    let nodes = outside_closures(&table, ROOT);
    let mut sites = Vec::new();
    for node in &nodes {
        if matches!(table.kind(*node), K::CALL_EXPRESSION | K::NEW_EXPRESSION) {
            sites.extend(target_site(cx, file, *node)?);
        }
    }
    sites.extend(value_references(cx, file, &nodes)?);
    Ok(unique_ids(cx, sites, None))
}

fn sole_statement(t: T, node: u32) -> Option<(u32, bool)> {
    let body = t.child(node, "body")?;
    if t.kind(body) != K::BLOCK {
        return Some((body, true));
    }
    let statements = t.listed(body, "statements");
    let [only] = statements.as_slice() else { return None };
    match t.kind(*only) {
        K::RETURN_STATEMENT => expression(t, *only).map(|returned| (returned, true)),
        K::EXPRESSION_STATEMENT => expression(t, *only).map(|value| (value, false)),
        _ => None,
    }
}

pub fn accepts_position(cx: &Cx, site: usize, position: usize) -> bool {
    let node = cx.registry.sites[site].node;
    let table = cx.table(node.file);
    let parameters = declared_parameters(&table, node.node);
    position < parameters.len() || parameters.last().is_some_and(|last| table.child(*last, "dotDotDotToken").is_some())
}

fn forward_fact(cx: &mut Cx, scope: &Scope) -> Found<Option<Value>> {
    let table = cx.table(scope.file);
    let t = &*table;
    let kind = cx.registry.sites[scope.site].kind;
    if !matches!(kind, "method" | "function") || t.child(scope.root, "asteriskToken").is_some() {
        return Ok(None);
    }
    let Some((value, returned)) = sole_statement(t, scope.root) else { return Ok(None) };
    let call = if t.kind(value) == K::PARENTHESIZED_EXPRESSION { unwrap(t, value) } else { value };
    let arguments = t.listed(call, "arguments");
    if t.kind(call) != K::CALL_EXPRESSION || t.flags(call) & node_flags::OPTIONAL_CHAIN != 0 || arguments.iter().any(|argument| t.kind(*argument) == K::SPREAD_ELEMENT) {
        return Ok(None);
    }
    let Some(target) = target_site(cx, scope.file, call)? else { return Ok(None) };
    if has_modifier(t, scope.root, K::ASYNC_KEYWORD) {
        let thenable = match cx.type_at(At { file: scope.file, node: call })? {
            Some(kind) => cx.has_property(&kind, "then")?,
            None => false,
        };
        if !(returned && thenable) {
            return Ok(None);
        }
    }
    let parameters = declared_parameters(t, scope.root);
    let mut passed: Vec<i64> = Vec::new();
    for argument in &arguments {
        let mut index = -1;
        if t.kind(*argument) == K::IDENTIFIER {
            let symbol = cx.symbol(At { file: scope.file, node: *argument })?;
            let declaration = cx.value_declaration(symbol.as_deref())?;
            let found = parameters.iter().position(|parameter| declaration == Some(At { file: scope.file, node: *parameter }));
            if let Some(found) = found.filter(|found| name_of(t, parameters[*found]).is_some_and(|name| t.kind(name) == K::IDENTIFIER) && t.child(parameters[*found], "dotDotDotToken").is_none()) {
                index = found as i64;
            }
        }
        passed.push(index);
    }
    let fits = (0..arguments.len()).all(|position| accepts_position(cx, target, position));
    Ok((fits && passed.iter().any(|index| *index != -1)).then(|| json!({ "target": cx.registry.sites[target].id, "arguments": passed, "returned": returned })))
}

fn is_entry(cx: &mut Cx, index: usize) -> Found<bool> {
    let site = &cx.registry.sites[index];
    if site.callback {
        return Ok(true);
    }
    let table = cx.table(site.node.file);
    let t = &*table;
    let Some(member) = site.member else {
        let declaration = site.declaration.node;
        let is_default = t.kind(declaration) == K::EXPORT_ASSIGNMENT || has_modifier(t, declaration, K::DEFAULT_KEYWORD);
        let framework = cx.input.files.iter().find(|(name, _)| name == cx.path(site.node.file)).is_some_and(|(_, info)| info.framework_default);
        return Ok(site.name == "main" || (is_default && framework));
    };
    // Decorators count where the language allows them: not on a constructor or a signature.
    let decorated = |node: u32| matches!(t.kind(node), K::PROPERTY_DECLARATION | K::METHOD_DECLARATION | K::GET_ACCESSOR | K::SET_ACCESSOR | K::CLASS_DECLARATION | K::CLASS_EXPRESSION) && has_modifier(t, node, K::DECORATOR);
    if has_modifier(t, member, K::OVERRIDE_KEYWORD) || decorated(member) || site.name.starts_with("[Symbol.") {
        return Ok(true);
    }
    let class = site.class_entry.map(|entry| cx.registry.entries[entry].node);
    if t.kind(member) == K::CONSTRUCTOR {
        return Ok(class.is_some_and(|class| decorated(class.node)));
    }
    if site.is_static || matches!(site.name.as_str(), "toString" | "toJSON" | "valueOf" | "equals") {
        return Ok(false);
    }
    let (name, file) = (site.name.clone(), site.node.file);
    let Some(class) = class else { return Ok(false) };
    for (_, types) in heritage_clauses(t, class.node) {
        for clause in types {
            if let Some(kind) = cx.type_at(At { file, node: clause })? {
                if cx.has_property(&kind, &name)? {
                    return Ok(true);
                }
            }
        }
    }
    Ok(false)
}

fn add_list(fact: &mut Value, name: &str, items: Vec<Value>) {
    if !items.is_empty() {
        fact[name] = Value::Array(items);
    }
}

pub fn callable_fact(cx: &mut Cx, index: usize) -> Found<Value> {
    let site = &cx.registry.sites[index];
    let (file, root, kind, bodyless) = (site.node.file, site.node.node, site.kind, site.bodyless);
    let table = cx.table(file);
    let mut scope = Scope { site: index, file, root, nodes: descendants(&table, root), keys: HashMap::new(), name_counts: HashMap::new() };
    let mut fact = json!({ "id": site.id, "file": site.path, "name": site.name, "line": site.line, "kind": kind, "exported": site.exported });
    if let Some(owner) = &site.owner {
        fact["owner"] = json!(owner);
    }
    if is_entry(cx, index)? {
        fact["entry"] = json!(true);
    }
    add_list(&mut fact, "params", param_facts(cx, &scope)?);
    if kind != "constructor" {
        if let Some(returns) = declared_return_type(cx, &scope)? {
            fact["returns"] = json!(returns);
        }
    }
    if bodyless {
        return Ok(fact);
    }
    if let Some(forward) = forward_fact(cx, &scope)? {
        fact["forward"] = forward;
    }
    let calls = collect_calls(cx, &mut scope)?;
    add_list(&mut fact, "calls", calls);
    let mut referenced = value_references(cx, file, &scope.nodes)?;
    referenced.extend(held_references(cx, file, &scope.nodes)?);
    add_list(&mut fact, "references", unique_ids(cx, referenced, Some(index)).into_iter().map(Value::String).collect());
    add_list(&mut fact, "paramUses", param_use_facts(cx, &scope)?);
    add_list(&mut fact, "ownFields", own_field_names(cx, &scope)?.into_iter().map(Value::String).collect());
    if let Some(field) = returned_field(cx, &scope)? {
        fact["returnsField"] = json!(field);
    }
    add_list(&mut fact, "decisions", decision_facts(cx, &scope)?);
    add_list(&mut fact, "reads", read_facts(cx, &scope)?);
    Ok(fact)
}
