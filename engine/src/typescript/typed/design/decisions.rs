//! Where a callable decides on the value of a field or an enum: `if` chains, conditional expressions, `switch`.
use super::calls::Scope;
use super::syntax::*;
use super::targets::symbol_of;
use super::uses::entry_of_node_or_type;
use super::{At, Cx, Found};
use crate::typescript::types::tables::kind as K;
use crate::typescript::types::tables::symbol_flags;
use serde_json::{Value, json};
use std::collections::HashSet;

struct Arm {
    subject: u32,
    constants: Vec<String>,
}

fn enum_member_name(cx: &mut Cx, file: u32, node: u32) -> Found<Option<String>> {
    let table = cx.table(file);
    let t = &*table;
    if t.kind(node) != K::PROPERTY_ACCESS_EXPRESSION {
        return Ok(None);
    }
    let owner = expression(t, node).map(|owner| unwrap(t, owner));
    let owner_name = owner.and_then(|owner| if t.kind(owner) == K::PROPERTY_ACCESS_EXPRESSION { name_of(t, owner) } else { Some(owner) });
    let Some(name) = name_of(t, node) else { return Ok(None) };
    if !owner_name.is_some_and(|owner| t.kind(owner) == K::IDENTIFIER && cx.registry.enum_names.contains(&own_text(t, owner))) {
        return Ok(None);
    }
    let symbol = cx.symbol(At { file, node: name })?;
    Ok(symbol.filter(|symbol| symbol.flags & symbol_flags::ENUM_MEMBER != 0).map(|_| own_text(t, name)))
}

fn constant_of(cx: &mut Cx, file: u32, value: u32) -> Found<Option<String>> {
    let table = cx.table(file);
    let t = &*table;
    let node = unwrap(t, value);
    let kind = t.kind(node);
    if is_string_literal_like(kind) || kind == K::NUMERIC_LITERAL {
        return Ok(Some(own_text(t, node)));
    }
    if kind == K::PREFIX_UNARY_EXPRESSION {
        if let Some(operand) = t.child(node, "operand").filter(|operand| t.kind(*operand) == K::NUMERIC_LITERAL) {
            return Ok((unary_operator(t, node) == K::MINUS_TOKEN).then(|| format!("-{}", own_text(t, operand))));
        }
    }
    Ok(match kind {
        K::TRUE_KEYWORD => Some("true".to_string()),
        K::FALSE_KEYWORD => Some("false".to_string()),
        K::NULL_KEYWORD => Some("null".to_string()),
        K::IDENTIFIER if own_text(t, node) == "undefined" => Some("undefined".to_string()),
        _ => enum_member_name(cx, file, node)?,
    })
}

fn equality_arm(cx: &mut Cx, file: u32, node: u32) -> Found<Option<Arm>> {
    let table = cx.table(file);
    let t = &*table;
    if t.kind(node) != K::BINARY_EXPRESSION || !matches!(operator_token(t, node), K::EQUALS_EQUALS_EQUALS_TOKEN | K::EQUALS_EQUALS_TOKEN) {
        return Ok(None);
    }
    let (Some(left), Some(right)) = (t.child(node, "left"), t.child(node, "right")) else { return Ok(None) };
    if let Some(constant) = constant_of(cx, file, right)? {
        return Ok(Some(Arm { subject: unwrap(t, left), constants: vec![constant] }));
    }
    Ok(constant_of(cx, file, left)?.map(|constant| Arm { subject: unwrap(t, right), constants: vec![constant] }))
}

fn membership_arm(cx: &mut Cx, file: u32, node: u32) -> Found<Option<Arm>> {
    let table = cx.table(file);
    let t = &*table;
    if t.kind(node) != K::CALL_EXPRESSION {
        return Ok(None);
    }
    let Some(callee) = expression(t, node).map(|callee| unwrap(t, callee)).filter(|callee| t.kind(*callee) == K::PROPERTY_ACCESS_EXPRESSION) else { return Ok(None) };
    let Some(list) = expression(t, callee).map(|list| unwrap(t, list)) else { return Ok(None) };
    let arguments = t.listed(node, "arguments");
    let is_includes = t.kind(list) == K::ARRAY_LITERAL_EXPRESSION && name_of(t, callee).is_some_and(|name| own_text(t, name) == "includes") && arguments.len() == 1;
    if !is_includes {
        return Ok(None);
    }
    let elements = t.listed(list, "elements");
    let mut constants = Vec::new();
    for element in &elements {
        constants.extend(constant_of(cx, file, *element)?);
    }
    Ok((!constants.is_empty() && constants.len() == elements.len()).then(|| Arm { subject: unwrap(t, arguments[0]), constants }))
}

fn subject_key(t: T, subject: u32) -> String {
    let compact: String = t.node_text(subject).chars().filter(|character| !((character.is_whitespace() && *character != '\u{85}') || *character == '\u{feff}')).collect();
    compact.replace("?.", ".").replace('!', "")
}

fn unique(constants: impl Iterator<Item = String>) -> Vec<String> {
    let mut seen = HashSet::new();
    constants.filter(|constant| seen.insert(constant.clone())).collect()
}

fn condition_arm(cx: &mut Cx, file: u32, condition: u32) -> Found<Option<Arm>> {
    let table = cx.table(file);
    let t = &*table;
    let mut pending = vec![unwrap(t, condition)];
    let mut parts: Vec<(u32, Option<Arm>)> = Vec::new();
    let mut next = 0;
    while next < pending.len() {
        let node = pending[next];
        next += 1;
        if t.kind(node) == K::BINARY_EXPRESSION && operator_token(t, node) == K::BAR_BAR_TOKEN {
            pending.extend([t.child(node, "left"), t.child(node, "right")].into_iter().flatten().map(|side| unwrap(t, side)));
        } else {
            let arm = match equality_arm(cx, file, node)? {
                Some(arm) => Some(arm),
                None => membership_arm(cx, file, node)?,
            };
            parts.push((t.pos(node), arm));
        }
    }
    parts.sort_by_key(|(at, _)| *at);
    let total = parts.len();
    let defined: Vec<Arm> = parts.into_iter().filter_map(|(_, arm)| arm).collect();
    let Some(first) = defined.first() else { return Ok(None) };
    let key = subject_key(t, first.subject);
    let same = defined.len() == total && defined.iter().all(|arm| subject_key(t, arm.subject) == key);
    Ok(same.then(|| Arm { subject: first.subject, constants: unique(defined.iter().flat_map(|arm| arm.constants.iter().cloned())) }))
}

fn declared_type_node(cx: &mut Cx, file: u32, value: u32) -> Found<Option<At>> {
    let table = cx.table(file);
    let identifier = if table.kind(value) == K::PROPERTY_ACCESS_EXPRESSION { name_of(&table, value).unwrap_or(value) } else { value };
    if table.kind(identifier) != K::IDENTIFIER {
        return Ok(None);
    }
    let symbol = symbol_of(cx, At { file, node: identifier })?;
    let declaration = cx.value_declaration(symbol.as_deref())?;
    Ok(declaration.and_then(|declaration| declared_type_of(&cx.table(declaration.file), declaration.node).map(|node| At { file: declaration.file, node })))
}

fn entry_of_value(cx: &mut Cx, file: u32, value: u32) -> Found<Option<usize>> {
    let type_node = declared_type_node(cx, file, value)?;
    let kind = cx.type_at(At { file, node: value })?;
    entry_of_node_or_type(cx, type_node, kind.as_deref())
}

fn field_subject(cx: &mut Cx, scope: &Scope, value: u32) -> Found<Option<String>> {
    let table = cx.table(scope.file);
    let t = &*table;
    let Some(name) = accessed_name(t, value).filter(|name| cx.registry.field_names.contains(name)) else { return Ok(None) };
    let Some(receiver) = expression(t, value).map(|receiver| unwrap(t, receiver)) else { return Ok(None) };
    let entry = if t.kind(receiver) == K::THIS_KEYWORD { cx.registry.sites[scope.site].class_entry } else { entry_of_value(cx, scope.file, receiver)? };
    let named = if t.kind(value) == K::PROPERTY_ACCESS_EXPRESSION { name_of(t, value) } else { t.child(value, "argumentExpression") };
    let symbol = match named {
        Some(named) => cx.symbol(At { file: scope.file, node: named })?,
        None => None,
    };
    let declaration = cx.value_declaration(symbol.as_deref())?;
    let is_field = declaration.is_some_and(|declaration| matches!(cx.kind(declaration), K::PROPERTY_DECLARATION | K::PROPERTY_SIGNATURE | K::PARAMETER | K::BINARY_EXPRESSION | K::PROPERTY_ACCESS_EXPRESSION));
    Ok(entry.filter(|entry| is_field && matches!(cx.registry.entries[*entry].kind, "class" | "data" | "interface")).map(|entry| format!("{}.{name}", cx.registry.entries[entry].id)))
}

fn subject_of(cx: &mut Cx, scope: &Scope, subject: u32, constants: &[String]) -> Found<Option<String>> {
    let table = cx.table(scope.file);
    let t = &*table;
    let value = unwrap(t, subject);
    let kind = t.kind(value);
    let is_element = kind == K::ELEMENT_ACCESS_EXPRESSION && t.child(value, "argumentExpression").is_some_and(|argument| is_string_literal_like(t.kind(argument)));
    if !(matches!(kind, K::IDENTIFIER | K::PROPERTY_ACCESS_EXPRESSION) || is_element) {
        return Ok(None);
    }
    if kind != K::IDENTIFIER {
        if let Some(found) = field_subject(cx, scope, value)? {
            return Ok(Some(found));
        }
    }
    if !constants.iter().any(|constant| cx.registry.enum_cases.contains(constant)) {
        return Ok(None);
    }
    let entry = entry_of_value(cx, scope.file, value)?;
    Ok(entry.filter(|entry| cx.registry.entries[*entry].kind == "enum").map(|entry| cx.registry.entries[entry].id.clone()))
}

fn branches(t: T, node: u32) -> (Option<u32>, Option<u32>) {
    if t.kind(node) == K::IF_STATEMENT { (expression(t, node), t.child(node, "elseStatement")) } else { (t.child(node, "condition"), t.child(node, "whenFalse")) }
}

fn is_conditional(kind: u32) -> bool {
    matches!(kind, K::IF_STATEMENT | K::CONDITIONAL_EXPRESSION)
}

fn decision(subject: String, groups: Vec<Vec<String>>, line: u32, otherwise: bool) -> Value {
    let mut fact = json!({ "subject": subject, "groups": groups, "line": line });
    if otherwise {
        fact["otherwise"] = json!(true);
    }
    fact
}

fn conditional_decision(cx: &mut Cx, scope: &Scope, node: u32, consumed: &mut HashSet<u32>) -> Found<Option<Value>> {
    let table = cx.table(scope.file);
    let t = &*table;
    let mut arms: Vec<Arm> = Vec::new();
    let mut links = vec![node];
    loop {
        let cursor = links[links.len() - 1];
        let (condition, otherwise) = branches(t, cursor);
        let arm = match condition {
            Some(condition) => condition_arm(cx, scope.file, condition)?,
            None => None,
        };
        let matching = arm.filter(|arm| arms.first().is_none_or(|first| subject_key(t, arm.subject) == subject_key(t, first.subject)));
        let Some(arm) = matching else { break };
        arms.push(arm);
        match otherwise.map(|otherwise| unwrap(t, otherwise)).filter(|next| is_conditional(t.kind(*next))) {
            Some(next) => links.push(next),
            None => break,
        }
    }
    consumed.extend(links.iter().take(arms.len()).skip(1).copied());
    let last_matched = arms.len() == links.len();
    let otherwise = if last_matched { branches(t, links[links.len() - 1]).1.is_some() } else { !arms.is_empty() };
    let Some(first) = arms.first() else { return Ok(None) };
    let constants: Vec<String> = arms.iter().flat_map(|arm| arm.constants.iter().cloned()).collect();
    let subject = subject_of(cx, scope, first.subject, &constants)?;
    Ok(subject.map(|subject| decision(subject, arms.into_iter().map(|arm| arm.constants).collect(), line_of(t, node), otherwise)))
}

fn switch_decision(cx: &mut Cx, scope: &Scope, node: u32) -> Found<Option<Value>> {
    let table = cx.table(scope.file);
    let t = &*table;
    let clauses = t.child(node, "caseBlock").map(|block| t.listed(block, "clauses")).unwrap_or_default();
    let mut groups: Vec<Vec<String>> = Vec::new();
    let mut pending: Vec<String> = Vec::new();
    let mut values = Vec::new();
    for clause in &clauses {
        if t.kind(*clause) == K::DEFAULT_CLAUSE {
            values.push(None);
            continue;
        }
        let value = match expression(t, *clause) {
            Some(value) => constant_of(cx, scope.file, value)?,
            None => None,
        };
        if value.is_none() {
            return Ok(None);
        }
        values.push(value);
    }
    for (clause, value) in clauses.iter().zip(values) {
        if t.kind(*clause) == K::DEFAULT_CLAUSE {
            pending = Vec::new();
            continue;
        }
        pending.extend(value);
        if !t.listed(*clause, "statements").is_empty() {
            groups.push(std::mem::take(&mut pending));
        }
    }
    if !pending.is_empty() {
        groups.push(pending);
    }
    if groups.is_empty() {
        return Ok(None);
    }
    let Some(subject) = expression(t, node) else { return Ok(None) };
    let constants: Vec<String> = groups.iter().flatten().cloned().collect();
    let otherwise = clauses.iter().any(|clause| t.kind(*clause) == K::DEFAULT_CLAUSE);
    Ok(subject_of(cx, scope, subject, &constants)?.map(|subject| decision(subject, groups, line_of(t, node), otherwise)))
}

pub fn decision_facts(cx: &mut Cx, scope: &Scope) -> Found<Vec<Value>> {
    let table = cx.table(scope.file);
    let mut consumed = HashSet::new();
    let mut decisions = Vec::new();
    for node in &scope.nodes {
        let kind = table.kind(*node);
        let found = if kind == K::SWITCH_STATEMENT {
            switch_decision(cx, scope, *node)?
        } else if is_conditional(kind) && !consumed.contains(node) {
            conditional_decision(cx, scope, *node, &mut consumed)?
        } else {
            None
        };
        decisions.extend(found);
    }
    Ok(decisions)
}
