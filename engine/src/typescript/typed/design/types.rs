//! The project's types: classes, interfaces, object type aliases, enums and each file as a module.
use super::syntax::*;
use super::{At, Cx, Found, TypeEntry};
use crate::typescript::types::nodes::ROOT;
use crate::typescript::types::server::{Symbol, Type};
use crate::typescript::types::tables::kind as K;
use crate::typescript::types::tables::node_flags;
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

/// A statement with the namespaces around it.
#[derive(Clone)]
pub struct Scoped {
    pub statement: u32,
    pub prefix: String,
    pub anchor: Option<u32>,
    /// The namespaces from the outside in; a declaration inside is exported when each of them is and it
    /// carries `export` itself.
    namespaces: Vec<u32>,
    /// Whether the innermost namespace is written `A.B`, where `B` has no modifiers of its own.
    dotted: bool,
}

fn has_export_modifier(t: T, declaration: u32) -> bool {
    let mut node = declaration;
    if t.kind(node) == K::VARIABLE_DECLARATION {
        node = t.parent(node).and_then(|list| t.parent(list)).unwrap_or(node);
    }
    has_modifier(t, node, K::EXPORT_KEYWORD)
}

impl Scoped {
    pub fn is_exported(&self, t: T, exported: &HashSet<At>, file: u32, declaration: u32) -> bool {
        let Some((first, inner)) = self.namespaces.split_first() else {
            return exported.contains(&At { file, node: declaration });
        };
        let chain = exported.contains(&At { file, node: *first }) && inner.iter().all(|namespace| has_export_modifier(t, *namespace));
        chain && (self.dotted || has_export_modifier(t, declaration))
    }
}

fn is_global_augmentation(t: T, statement: u32, name: u32) -> bool {
    // `declare global {}` has no `namespace` or `module` word: its name is the first token after the modifiers.
    let after_modifiers = t.listed(statement, "modifiers").last().map_or(t.pos(statement), |modifier| t.end(*modifier));
    own_text(t, name) == "global" && t.source().skip_trivia(after_modifiers, false) == t.start(name)
}

fn namespace_body(t: T, statement: u32) -> Option<u32> {
    if t.kind(statement) != K::MODULE_DECLARATION {
        return None;
    }
    let name = name_of(t, statement)?;
    (t.kind(name) == K::IDENTIFIER && !is_global_augmentation(t, statement, name)).then(|| t.child(statement, "body")).flatten()
}

pub fn scoped_statements(t: T) -> Vec<Scoped> {
    let top = Scoped { statement: 0, prefix: String::new(), anchor: None, namespaces: Vec::new(), dotted: false };
    let mut pending: Vec<Scoped> = t.listed(ROOT, "statements").into_iter().map(|statement| Scoped { statement, ..top.clone() }).collect();
    let mut flat = Vec::new();
    let mut next = 0;
    while next < pending.len() {
        let entry = pending[next].clone();
        next += 1;
        let Some(body) = namespace_body(t, entry.statement) else {
            flat.push(entry);
            continue;
        };
        let name = name_of(t, entry.statement).map(|name| own_text(t, name)).unwrap_or_default();
        let prefix = format!("{}{name}.", entry.prefix);
        let anchor = entry.anchor.or(Some(entry.statement));
        if t.kind(body) == K::MODULE_DECLARATION {
            let namespaces = if entry.dotted { entry.namespaces.clone() } else { [entry.namespaces.clone(), vec![entry.statement]].concat() };
            pending.push(Scoped { statement: body, prefix, anchor, namespaces, dotted: true });
        } else {
            let namespaces = if entry.dotted { entry.namespaces.clone() } else { [entry.namespaces.clone(), vec![entry.statement]].concat() };
            let statements = if t.kind(body) == K::MODULE_BLOCK { t.listed(body, "statements") } else { Vec::new() };
            pending.extend(statements.into_iter().map(|statement| Scoped { statement, prefix: prefix.clone(), anchor, namespaces: namespaces.clone(), dotted: false }));
        }
    }
    flat.sort_by_key(|entry| t.pos(entry.statement));
    flat
}

fn has_behaviour(t: T, class: u32) -> bool {
    t.listed(class, "members").into_iter().any(|member| match t.kind(member) {
        K::METHOD_DECLARATION => !matches!(name_of(t, member).map(|name| t.node_text(name)), Some("toString" | "toJSON" | "valueOf")),
        K::PROPERTY_DECLARATION => is_function_value(t, t.child(member, "initializer")),
        _ => false,
    })
}

fn literal_text(t: T, node: u32) -> Option<String> {
    let literal = t.child(node, "literal")?;
    match t.kind(literal) {
        K::STRING_LITERAL | K::NO_SUBSTITUTION_TEMPLATE_LITERAL | K::NUMERIC_LITERAL => Some(own_text(t, literal)),
        K::PREFIX_UNARY_EXPRESSION if unary_operator(t, literal) == K::MINUS_TOKEN => {
            t.child(literal, "operand").filter(|operand| t.kind(*operand) == K::NUMERIC_LITERAL).map(|operand| format!("-{}", own_text(t, operand)))
        }
        _ => None,
    }
}

fn reference_name(t: T, reference: u32) -> Option<u32> {
    let name = t.child(reference, "typeName")?;
    if t.kind(name) == K::QUALIFIED_NAME { t.child(name, "right") } else { Some(name) }
}

fn referenced_alias(cx: &mut Cx, at: At) -> Found<Option<At>> {
    let table = cx.table(at.file);
    let Some(name) = reference_name(&table, at.node) else { return Ok(None) };
    let symbol = cx.symbol(At { file: at.file, node: name })?;
    let target = cx.follow(symbol)?;
    Ok(cx.declarations(target.as_deref())?.into_iter().find(|declaration| cx.kind(*declaration) == K::TYPE_ALIAS_DECLARATION))
}

fn is_plain_reference(t: T, node: u32) -> bool {
    t.kind(node) == K::TYPE_REFERENCE && !t.has_list(node, "typeArguments")
}

/// The literal members of a union alias, through parentheses and other aliases; `None` when anything else
/// is in the union.
fn literal_cases(cx: &mut Cx, file: u32, alias: u32) -> Found<Option<Vec<String>>> {
    let table = cx.table(file);
    let Some(root) = table.child(alias, "type") else { return Ok(None) };
    let mut seen: HashSet<At> = HashSet::from([At { file, node: alias }]);
    let mut pending = vec![At { file, node: root }];
    let mut cases: Vec<String> = Vec::new();
    while let Some(at) = pending.pop() {
        let t = cx.table(at.file);
        let kind = t.kind(at.node);
        let text = if kind == K::LITERAL_TYPE { literal_text(&t, at.node) } else { None };
        let target = if is_plain_reference(&t, at.node) { referenced_alias(cx, at)? } else { None };
        match text {
            Some(text) => {
                if !cases.contains(&text) {
                    cases.push(text);
                }
            }
            None if !(matches!(kind, K::PARENTHESIZED_TYPE | K::UNION_TYPE) || target.is_some()) => return Ok(None),
            None => {}
        }
        let children: Vec<At> = match kind {
            K::PARENTHESIZED_TYPE => t.child(at.node, "type").into_iter().map(|node| At { file: at.file, node }).collect(),
            K::UNION_TYPE => t.listed(at.node, "types").into_iter().map(|node| At { file: at.file, node }).collect(),
            _ => match target {
                Some(target) if seen.insert(target) => cx.table(target.file).child(target.node, "type").into_iter().map(|node| At { file: target.file, node }).collect(),
                _ => Vec::new(),
            },
        };
        pending.extend(children.into_iter().rev());
    }
    Ok((!cases.is_empty()).then_some(cases))
}

fn enum_member_names(t: T, declaration: u32) -> Vec<String> {
    t.listed(declaration, "members")
        .into_iter()
        .map(|member| match name_of(t, member) {
            Some(name) if t.kind(name) == K::STRING_LITERAL => own_text(t, name),
            Some(name) => text(t, name),
            None => String::new(),
        })
        .collect()
}

fn describe(cx: &mut Cx, file: u32, statement: u32) -> Found<Option<(&'static str, Option<Vec<String>>)>> {
    let table = cx.table(file);
    let t = &*table;
    Ok(match t.kind(statement) {
        K::CLASS_DECLARATION => Some((if has_behaviour(t, statement) { "class" } else { "data" }, None)),
        K::INTERFACE_DECLARATION => Some(("data", None)),
        K::ENUM_DECLARATION => Some(("enum", Some(enum_member_names(t, statement)))),
        K::TYPE_ALIAS_DECLARATION => {
            if t.child(statement, "type").is_some_and(|aliased| t.kind(aliased) == K::TYPE_LITERAL) {
                Some(("data", None))
            } else {
                literal_cases(cx, file, statement)?.map(|cases| ("enum", Some(cases)))
            }
        }
        _ => None,
    })
}

fn add_file_types(cx: &mut Cx, file: u32) -> Found<()> {
    let table = cx.table(file);
    let t = &*table;
    let path = cx.input.files.iter().find(|(name, _)| name == cx.path(file)).map(|(_, info)| info.path.clone()).unwrap_or_default();
    let stem = path.rsplit('/').next().unwrap_or(&path);
    let name = match stem.rfind('.') {
        Some(dot) if dot > 0 => &stem[..dot],
        _ => stem,
    };
    let module = At { file, node: ROOT };
    let entry = TypeEntry { id: path.clone(), file: path.clone(), name: name.to_string(), node: module, node_kind: K::SOURCE_FILE, kind: "module", exported: true, anchor: None, cases: None, implemented: false, field_names: HashSet::new() };
    cx.registry.type_ids.insert(path.clone(), cx.registry.entries.len());
    cx.registry.type_by_node.insert(module, cx.registry.entries.len());
    cx.registry.entries.push(entry);
    let exported = Rc::clone(&cx.registry.exported_by_file[&file]);
    for scope in scoped_statements(t) {
        let statement = scope.statement;
        let Some((kind, cases)) = describe(cx, file, statement)? else { continue };
        let name = name_of(t, statement).and_then(|name| t.text(name).map(|text| text.into_owned())).unwrap_or_else(|| "default".to_string());
        let is_exported = scope.is_exported(t, &exported, file, statement);
        let node = At { file, node: statement };
        let anchor = scope.anchor.map(|anchor| At { file, node: anchor });
        let id = format!("{path}#{}{name}", scope.prefix);
        if let Some(known) = cx.registry.type_ids.get(&id).copied() {
            let entry = &mut cx.registry.entries[known];
            let merged = entry.exported || is_exported;
            if t.kind(statement) == K::CLASS_DECLARATION && entry.node_kind != K::CLASS_DECLARATION {
                (entry.node, entry.node_kind, entry.name, entry.anchor, entry.kind) = (node, K::CLASS_DECLARATION, name, anchor, kind);
                if cases.is_some() {
                    entry.cases = cases;
                }
            }
            entry.exported = merged;
            cx.registry.type_by_node.insert(node, known);
            continue;
        }
        let created = TypeEntry { id: id.clone(), file: path.clone(), name, node, node_kind: t.kind(statement), kind, exported: is_exported, anchor, cases, implemented: false, field_names: HashSet::new() };
        cx.registry.type_ids.insert(id, cx.registry.entries.len());
        cx.registry.type_by_node.insert(node, cx.registry.entries.len());
        cx.registry.entries.push(created);
    }
    Ok(())
}

pub fn entry_of_symbol(cx: &mut Cx, symbol: Option<Rc<Symbol>>) -> Found<Option<usize>> {
    let target = cx.follow(symbol)?;
    for declaration in cx.declarations(target.as_deref())? {
        let table = cx.table(declaration.file);
        let found = cx.registry.type_by_node.get(&declaration).copied().or_else(|| {
            (table.kind(declaration.node) == K::ENUM_MEMBER).then(|| table.parent(declaration.node)).flatten().and_then(|parent| cx.registry.type_by_node.get(&At { file: declaration.file, node: parent }).copied())
        });
        if found.is_some() {
            return Ok(found);
        }
    }
    Ok(None)
}

fn heritage_entries(cx: &mut Cx, index: usize, keep: impl Fn(bool) -> bool) -> Found<Vec<usize>> {
    let node = cx.registry.entries[index].node;
    let table = cx.table(node.file);
    let mut found = Vec::new();
    for (implements, types) in heritage_clauses(&table, node.node) {
        if !keep(implements) {
            continue;
        }
        for clause in types {
            let Some(target) = expression(&table, clause) else { continue };
            let symbol = cx.symbol(At { file: node.file, node: target })?;
            if let Some(entry) = entry_of_symbol(cx, symbol)?.filter(|entry| *entry != index) {
                found.push(entry);
            }
        }
    }
    Ok(found)
}

pub fn collect(cx: &mut Cx, files: &[u32]) -> Found<()> {
    for file in files {
        add_file_types(cx, *file)?;
    }
    for index in 0..cx.registry.entries.len() {
        if cx.registry.entries[index].node_kind == K::CLASS_DECLARATION {
            for target in heritage_entries(cx, index, |implements| implements)? {
                cx.registry.entries[target].implemented = true;
            }
        }
    }
    for entry in &mut cx.registry.entries {
        if entry.kind == "data" && entry.node_kind != K::CLASS_DECLARATION && entry.implemented {
            entry.kind = "interface";
        }
    }
    Ok(())
}

pub fn index(cx: &mut Cx) {
    let registry = &mut cx.registry;
    for entry in &registry.entries {
        if entry.node_kind == K::CLASS_DECLARATION {
            registry.class_names.insert(entry.name.clone());
        }
        if entry.node_kind == K::ENUM_DECLARATION {
            registry.enum_names.insert(entry.name.clone());
        }
        registry.enum_cases.extend(entry.cases.iter().flatten().cloned());
    }
}

fn is_const_assertion(t: T, node: u32) -> bool {
    t.kind(node) == K::AS_EXPRESSION && t.child(node, "type").is_some_and(|kind| t.kind(kind) == K::TYPE_REFERENCE && t.child(kind, "typeName").is_some_and(|name| t.node_text(name) == "const"))
}

pub fn is_mutable_value(t: T, node: Option<u32>) -> bool {
    let Some(node) = node.filter(|node| !is_const_assertion(t, *node)) else { return false };
    let value = unwrap(t, node);
    match t.kind(value) {
        K::ARRAY_LITERAL_EXPRESSION => !t.listed(value, "elements").into_iter().any(|element| t.kind(element) == K::SPREAD_ELEMENT),
        K::OBJECT_LITERAL_EXPRESSION => !t.listed(value, "properties").into_iter().any(|property| t.kind(property) == K::SPREAD_ASSIGNMENT),
        K::NEW_EXPRESSION => expression(t, value).is_some_and(|callee| t.kind(callee) == K::IDENTIFIER && matches!(&*own_text(t, callee), "Map" | "Set" | "WeakMap" | "WeakSet" | "Array" | "Object")),
        K::CALL_EXPRESSION => expression(t, value).is_some_and(|callee| matches!(t.node_text(callee), "Array.from" | "Object.create" | "Object.fromEntries")),
        _ => false,
    }
}

fn is_readonly_type(t: T, node: Option<u32>) -> bool {
    let Some(node) = node else { return false };
    match t.kind(node) {
        K::TYPE_OPERATOR => t.data_bits(node, 24, 3) == 1,
        K::TYPE_REFERENCE => t.child(node, "typeName").is_some_and(|name| matches!(t.node_text(name), "ReadonlyArray" | "ReadonlyMap" | "ReadonlySet" | "Readonly")),
        _ => false,
    }
}

fn this_member_name(t: T, left: u32) -> Option<String> {
    (t.kind(left) == K::PROPERTY_ACCESS_EXPRESSION && expression(t, left).is_some_and(|base| t.kind(base) == K::THIS_KEYWORD)).then(|| name_of(t, left).map(|name| own_text(t, name))).flatten()
}

fn assigned_values(t: T, class: u32) -> HashMap<String, Vec<u32>> {
    let mut values: HashMap<String, Vec<u32>> = HashMap::new();
    for node in descendants(t, class) {
        let kind = t.kind(node);
        let initializer = if kind == K::PROPERTY_DECLARATION { t.child(node, "initializer") } else { None };
        let is_binary = kind == K::BINARY_EXPRESSION;
        let name = match initializer {
            Some(_) => name_of(t, node).map(|name| text(t, name)),
            None if is_binary && is_assignment_operator(operator_token(t, node)) => t.child(node, "left").and_then(|left| this_member_name(t, left)),
            None => None,
        };
        let value = initializer.or_else(|| if is_binary { t.child(node, "right") } else { None });
        if let (Some(name), Some(value)) = (name, value) {
            values.entry(name).or_default().push(value);
        }
    }
    values
}

fn assigned_names(t: T) -> HashSet<String> {
    let mut names = HashSet::new();
    for node in descendants(t, ROOT) {
        if t.kind(node) == K::BINARY_EXPRESSION && is_assignment_operator(operator_token(t, node)) {
            if let Some(left) = t.child(node, "left").filter(|left| t.kind(*left) == K::IDENTIFIER) {
                names.insert(own_text(t, left));
            }
        }
        if is_step(t, node) {
            if let Some(operand) = t.child(node, "operand").filter(|operand| t.kind(*operand) == K::IDENTIFIER) {
                names.insert(own_text(t, operand));
            }
        }
    }
    names
}

fn binding_names(t: T, name: u32) -> Vec<u32> {
    let mut names = Vec::new();
    let mut pending = vec![name];
    let mut next = 0;
    while next < pending.len() {
        let node = pending[next];
        next += 1;
        if t.kind(node) == K::IDENTIFIER {
            names.push(node);
        } else {
            pending.extend(t.listed(node, "elements").into_iter().filter(|element| t.kind(*element) == K::BINDING_ELEMENT).filter_map(|element| name_of(t, element)));
        }
    }
    names
}

fn field(name: String, mutable: bool, private: bool) -> Value {
    let mut fact = json!({ "name": name });
    if mutable {
        fact["mutable"] = json!(true);
    }
    if private {
        fact["private"] = json!(true);
    }
    fact
}

fn module_fields(t: T, file: u32, exported: &HashSet<At>) -> Vec<Value> {
    let assigned = assigned_names(t);
    let mut fields = Vec::new();
    for statement in t.listed(ROOT, "statements").into_iter().filter(|statement| t.kind(*statement) == K::VARIABLE_STATEMENT) {
        let Some(list) = t.child(statement, "declarationList") else { continue };
        let constant = t.flags(list) & node_flags::CONST != 0;
        for declaration in t.listed(list, "declarations") {
            let initializer = t.child(declaration, "initializer");
            if is_function_value(t, initializer) {
                continue;
            }
            for name in name_of(t, declaration).map(|name| binding_names(t, name)).unwrap_or_default() {
                let name = own_text(t, name);
                let mutable = is_mutable_value(t, initializer) && (constant || !assigned.contains(&name));
                fields.push(field(name, mutable, !exported.contains(&At { file, node: declaration })));
            }
        }
    }
    fields
}

fn property_fields(cx: &mut Cx, index: usize) -> Found<Vec<Value>> {
    let node = cx.registry.entries[index].node;
    let table = cx.table(node.file);
    let Some(kind): Option<Rc<Type>> = cx.type_at(node)? else { return Ok(Vec::new()) };
    let values = if table.kind(node.node) == K::CLASS_DECLARATION { assigned_values(&table, node.node) } else { HashMap::new() };
    let mut fields = Vec::new();
    let mut declarations = Vec::new();
    for property in cx.properties(&kind)? {
        let handle = property.value_declaration.as_ref().or(property.declarations.first());
        let Some(declaration) = handle.map(|handle| cx.at(handle)).transpose()? else { continue };
        if cx.registry.owned.contains(&declaration.file) {
            let place = (cx.path(declaration.file).encode_utf16().collect::<Vec<u16>>(), cx.table(declaration.file).pos(declaration.node));
            declarations.push((place, declaration));
        }
    }
    declarations.sort_by(|left, right| left.0.cmp(&right.0));
    for (_, declaration) in declarations {
        let owner = cx.table(declaration.file);
        let t = &*owner;
        let declared = declaration.node;
        match t.kind(declared) {
            K::PROPERTY_DECLARATION | K::PROPERTY_SIGNATURE | K::PARAMETER => {}
            K::BINARY_EXPRESSION | K::PROPERTY_ACCESS_EXPRESSION => return Err(format!("{} declares a property by assignment", cx.path(declaration.file))),
            _ => continue,
        }
        let initializer = if t.kind(declared) == K::PROPERTY_SIGNATURE { None } else { t.child(declared, "initializer") };
        if is_function_value(t, initializer) {
            continue;
        }
        let Some(name) = name_of(t, declared).map(|name| text(t, name)) else { continue };
        let assigned = values.get(&name).cloned().unwrap_or_default();
        let own_values = usize::from(initializer.is_some()) + assigned.len();
        let mutable = own_values > 0 && !is_readonly_type(t, t.child(declared, "type")) && is_mutable_value(t, initializer).eq(&initializer.is_some()) && assigned.iter().all(|value| is_mutable_value(&table, Some(*value)));
        let private = name_of(t, declared).is_some_and(|name| t.kind(name) == K::PRIVATE_IDENTIFIER) || has_modifier(t, declared, K::PRIVATE_KEYWORD) || has_modifier(t, declared, K::PROTECTED_KEYWORD);
        fields.push(field(name, mutable, private));
    }
    Ok(fields)
}

pub fn fact(cx: &mut Cx, index: usize) -> Found<Value> {
    let entry = &cx.registry.entries[index];
    let (node, kind) = (entry.node, entry.kind);
    let table = cx.table(node.file);
    let fields = match kind {
        "module" => module_fields(&table, node.file, &Rc::clone(&cx.registry.exported_by_file[&node.file])),
        "enum" => Vec::new(),
        _ => property_fields(cx, index)?,
    };
    let mut supertypes: Vec<String> = Vec::new();
    for target in heritage_entries(cx, index, |_| true)? {
        let id = cx.registry.entries[target].id.clone();
        if !supertypes.contains(&id) {
            supertypes.push(id);
        }
    }
    let entry = &cx.registry.entries[index];
    let mut fact = json!({
        "id": entry.id,
        "file": entry.file,
        "name": entry.name,
        "line": if kind == "module" { 1 } else { line_of(&table, node.node) },
        "kind": kind,
        "exported": entry.exported,
    });
    if !fields.is_empty() {
        fact["fields"] = json!(fields);
    }
    if !supertypes.is_empty() {
        fact["supertypes"] = json!(supertypes);
    }
    if let Some(cases) = &entry.cases {
        fact["cases"] = json!(cases);
    }
    Ok(fact)
}
