//! The parameter SpotBugs names as the value a self assignment of a field probably meant, measured on test code.
//! It looks at the parameters whose type (erased) is the field's, but finds each one's local variable at the slot
//! of its index plus one (plus none in a static method), as if no parameter took two slots: that slot's name, `?`
//! when no parameter starts there, and whether the method reads that slot (`x++` and `x += 1` read it, `x = 1`
//! does not). Of the unread ones, or of all when every one is read, the first without a name wins, else the one
//! whose name is nearest the field's name when no other is as near: an edit distance where a letter that only
//! differs in case costs half. A read one must be at most 2 away. Priority 1 when the chosen slot is unread. The hidden parameters javac adds come first: the name and number of an enum
//! constant, the object around an inner class, the captured variables of a lambda.
use super::super::Context;
use super::super::idioms::Compiled;
use crate::engine::source::{named_children, parent, walk};
use crate::java::types::expr::Binding;
use crate::java::types::model::Type;
use tree_sitter::Node;

struct Parameter {
    name: Option<String>,
    kind: Option<Type>,
    slot: usize,
    read: bool,
}

pub struct Suggested {
    pub name: String,
    pub unread: bool,
}

pub fn suggest(context: &Context, class: Node, method: &Compiled, fixed: bool, field: &Type, wanted: &str) -> Option<Suggested> {
    let parameters = parameters(context, class, method, fixed);
    let at = |index: usize| parameters.iter().find(|parameter| parameter.slot == index + usize::from(!fixed));
    let candidates: Vec<usize> = (0..parameters.len()).filter(|index| parameters[*index].kind.as_ref() == Some(field)).collect();
    let unread: Vec<usize> = candidates.iter().copied().filter(|index| !at(*index).is_some_and(|parameter| parameter.read)).collect();
    let limit = if unread.is_empty() { 4 } else { usize::MAX };
    let pool = if unread.is_empty() { candidates } else { unread };
    let name = |index: usize| at(index).and_then(|parameter| parameter.name.clone());
    let chosen = pool.iter().copied().find(|index| name(*index).is_none()).or_else(|| {
        let scored: Vec<(usize, usize)> = pool.iter().map(|index| (distance(&name(*index).unwrap_or_default(), wanted), *index)).collect();
        let best = scored.iter().map(|(score, _)| *score).min().filter(|best| *best <= limit)?;
        let mut winners = scored.iter().filter(|(score, _)| *score == best);
        let first = winners.next()?.1;
        winners.next().is_none().then_some(first)
    })?;
    let unread = !at(chosen).is_some_and(|parameter| parameter.read);
    Some(Suggested { name: name(chosen).unwrap_or_else(|| "?".to_string()), unread })
}

/// The edit distance in half steps: 2 to add, drop or change a letter, 1 to change only its case.
pub fn distance(one: &str, two: &str) -> usize {
    let (one, two): (Vec<char>, Vec<char>) = (one.chars().collect(), two.chars().collect());
    let change = |left: &char, right: &char| if left == right { 0 } else if left.to_lowercase().eq(right.to_lowercase()) { 1 } else { 2 };
    let mut row: Vec<usize> = (0..=two.len()).map(|steps| steps * 2).collect();
    for (i, left) in one.iter().enumerate() {
        let mut previous = row[0];
        row[0] = (i + 1) * 2;
        for (j, right) in two.iter().enumerate() {
            let kept = row[j + 1];
            row[j + 1] = (previous + change(left, right)).min(row[j] + 2).min(row[j + 1] + 2);
            previous = kept;
        }
    }
    row[two.len()]
}

fn width(kind: &Option<Type>) -> usize {
    if matches!(kind, Some(Type::Primitive("long" | "double"))) { 2 } else { 1 }
}

fn parameters(context: &Context, class: Node, method: &Compiled, fixed: bool) -> Vec<Parameter> {
    let mut found: Vec<(Option<String>, Option<Type>, bool)> = Vec::new();
    let member = method.member;
    let constructor = member.kind().ends_with("constructor_declaration") || (member.id() == class.id() && !method.label.contains(".<static initializer for "));
    if constructor && class.kind() == "enum_declaration" {
        found.push((Some("$enum$name".to_string()), Some(Type::class("java.lang.String")), true));
        found.push((Some("$enum$ordinal".to_string()), Some(Type::Primitive("int")), true));
    }
    if let Some(outer) = super::outer_of(context, class).filter(|_| constructor) {
        found.push((Some("this$0".to_string()), Some(Type::class(&outer)), true));
    }
    if method.lambda {
        for (name, kind) in captured(context, member) {
            found.push((Some(name), kind, true));
        }
    }
    let list = member.child_by_field_name("parameters");
    let declared: Vec<Node> = match list {
        Some(list) if list.kind() == "identifier" => vec![list],
        Some(list) => named_children(list).into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter" | "identifier")).collect(),
        None => Vec::new(),
    };
    let body = member.child_by_field_name("body").unwrap_or(member);
    for parameter in declared {
        let name = if parameter.kind() == "identifier" { Some(parameter) } else { super::super::expose::parameter_name(parameter) };
        let Some(name) = name else { continue };
        let text = context.text(name).to_string();
        let kind = match context.resolver.binding(name, &text) {
            Some(Binding::Local(Some(kind))) => Some(kind.erased()),
            _ => {
                let written = parameter.child_by_field_name("type").and_then(|written| context.resolver.type_node(written)).map(|kind| kind.erased());
                if parameter.kind() == "spread_parameter" { written.map(|kind| Type::Array(Box::new(kind))) } else { written }
            }
        };
        found.push((Some(text.clone()), kind, reads(context, body, &text)));
    }
    let mut slot = usize::from(!fixed);
    found.into_iter().map(|(name, kind, read)| {
        let parameter = Parameter { slot, read, name, kind };
        slot += width(&parameter.kind);
        parameter
    }).collect()
}

/// The local variables of the method around a lambda that its body uses, in the order it first uses them.
fn captured(context: &Context, lambda: Node) -> Vec<(String, Option<Type>)> {
    let mut found: Vec<(String, Option<Type>)> = Vec::new();
    let Some(body) = lambda.child_by_field_name("body") else { return found };
    walk(body, |node| {
        if node.kind() != "identifier" || !reading(node) {
            return;
        }
        let name = context.text(node);
        let Some(Binding::Local(kind)) = context.resolver.binding(node, name) else { return };
        let outside = declared_before(context, node, name).is_some_and(|at| at < lambda.start_byte());
        if outside && !found.iter().any(|(known, _)| known == name) {
            found.push((name.to_string(), kind.map(|kind| kind.erased())));
        }
    });
    found
}

fn declared_before(context: &Context, usage: Node, name: &str) -> Option<usize> {
    let mut scope = parent(usage);
    while let Some(node) = scope {
        let mut at = None;
        walk(node, |part| {
            let named = match part.kind() {
                "variable_declarator" | "formal_parameter" | "catch_formal_parameter" | "spread_parameter" => part.child_by_field_name("name").or_else(|| super::super::expose::parameter_name(part)),
                _ => None,
            };
            if at.is_none() && named.is_some_and(|named| context.text(named) == name) && part.start_byte() < usage.start_byte() {
                at = Some(part.start_byte());
            }
        });
        if at.is_some() {
            return at;
        }
        scope = parent(node);
    }
    None
}

/// An identifier that loads a variable: not a name being declared, not the target of `=`, not a member name.
fn reading(node: Node) -> bool {
    let Some(holder) = parent(node) else { return false };
    let is = |field: &str| holder.child_by_field_name(field).is_some_and(|part| part.id() == node.id());
    match holder.kind() {
        "assignment_expression" => !(is("left") && holder.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "=")),
        "field_access" => !is("field"),
        "method_invocation" => !is("name"),
        "variable_declarator" | "formal_parameter" | "catch_formal_parameter" | "spread_parameter" | "enhanced_for_statement" => is("value"),
        "inferred_parameters" | "lambda_expression" if !is("body") => false,
        "labeled_statement" | "break_statement" | "continue_statement" | "method_reference" | "scoped_identifier" => false,
        _ => true,
    }
}

fn reads(context: &Context, body: Node, name: &str) -> bool {
    let mut found = false;
    walk(body, |node| {
        found |= node.kind() == "identifier" && context.text(node) == name && reading(node) && matches!(context.resolver.binding(node, name), Some(Binding::Local(_)));
    });
    found
}
