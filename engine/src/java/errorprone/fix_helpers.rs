//! Fixes that add or remove modifiers of a declaration, the way Error Prone's `SuggestedFixes.addModifiers` and `removeModifiers` do.
use super::Context;
use super::fixes::Fix;
use crate::engine::source::children;
use tree_sitter::Node;

/// The modifiers in the order of javax.lang.model's `Modifier`.
const ORDER: [&str; 14] =
    ["public", "protected", "private", "abstract", "default", "static", "sealed", "non-sealed", "final", "transient", "volatile", "synchronized", "native", "strictfp"];

fn rank(word: &str) -> Option<usize> {
    ORDER.iter().position(|known| *known == word)
}

/// The modifier keywords of a declaration with the byte range of each.
fn keywords(declaration: Node) -> Vec<(&'static str, usize, usize)> {
    let Some(modifiers) = crate::java::helpers::modifiers(declaration) else { return Vec::new() };
    children(modifiers).into_iter().filter_map(|part| rank(part.kind()).map(|at| (ORDER[at], part.start_byte(), part.end_byte()))).collect()
}

/// Adds the modifiers that the declaration lacks, beside the existing ones in `Modifier` order.
pub fn add_modifiers(mut fix: Fix, declaration: Node, add: &[&str]) -> Fix {
    let existing = keywords(declaration);
    let missing: Vec<&str> = add.iter().copied().filter(|word| !existing.iter().any(|(known, _, _)| known == word)).collect();
    let mut pending: Vec<&str> = Vec::new();
    if existing.is_empty() {
        pending = missing;
    } else {
        let mut all: Vec<(usize, &str, Option<usize>)> = missing.iter().filter_map(|word| Some((rank(word)?, *word, None))).collect();
        all.extend(existing.iter().map(|(word, start, _)| (rank(word).unwrap_or_default(), *word, Some(*start))));
        all.sort_by_key(|entry| entry.0);
        for (_, word, position) in all {
            match position {
                None => pending.push(word),
                Some(at) if !pending.is_empty() => {
                    fix = fix.insert(at, format!("{} ", pending.join(" ")));
                    pending.clear();
                }
                Some(_) => {}
            }
        }
    }
    if pending.is_empty() {
        return fix;
    }
    let after_keywords = existing.iter().map(|(_, _, end)| end + 1).max();
    let at = after_keywords.unwrap_or_else(|| crate::java::helpers::modifiers(declaration).map_or_else(|| tree_start(declaration), |modifiers| modifiers.end_byte() + 1));
    fix.insert(at, format!("{} ", pending.join(" ")))
}

/// Where javac says a declaration without modifiers starts: a method with type parameters starts at the first of them.
fn tree_start(declaration: Node) -> usize {
    let list = children(declaration).into_iter().find(|part| part.kind() == "type_parameters");
    let first = list.and_then(|list| list.named_child(0)).filter(|first| first.start_byte() < declaration.end_byte());
    match (declaration.kind(), first) {
        ("method_declaration" | "constructor_declaration", Some(first)) => first.start_byte(),
        _ => declaration.start_byte(),
    }
}

/// Removes each of the modifiers, with the character after it.
pub fn remove_modifiers(mut fix: Fix, declaration: Node, remove: &[&str]) -> Fix {
    for (word, start, end) in keywords(declaration) {
        if remove.contains(&word) {
            fix = fix.delete(start, end + 1);
        }
    }
    fix
}

/// Error Prone's `SuggestedFixes.qualifyType` for a class name: the simple name when it is visible or can be imported
/// (the import is added to `fix`), else the name as far qualified as it takes.
pub fn qualify_type(context: &Context, at: Node, name: &str, fix: &mut Fix) -> String {
    let components: Vec<&str> = name.split('.').collect();
    let simple = components[components.len() - 1];
    if context.resolver.class_name(at, simple).is_some_and(|found| found == name) {
        return simple.to_string();
    }
    for (index, component) in components.iter().enumerate() {
        if !component.starts_with(|first: char| first.is_uppercase()) {
            continue;
        }
        let prefix = components[..=index].join(".");
        match context.resolver.class_name(at, component) {
            None => {
                *fix = std::mem::take(fix).with_imports();
                return components[index..].join(".");
            }
            Some(found) if found == prefix => return components[index..].join("."),
            Some(_) => {}
        }
    }
    name.to_string()
}

/// Deletes the range together with the whitespace before it.
pub fn delete_with_leading_whitespace(text: &str, start: usize, end: usize) -> Fix {
    let kept = text[..start].trim_end_matches(char::is_whitespace).len();
    Fix::replace(kept, end, "")
}

/// The members, comments and stray tokens of the body a member sits in; the constants and the declarations of an enum are one list.
fn body_items<'t>(member: Node<'t>) -> Option<Vec<Node<'t>>> {
    let holder = member.parent()?;
    let body = match holder.kind() {
        "class_body" | "interface_body" | "annotation_type_body" | "enum_body" => holder,
        "enum_body_declarations" => holder.parent()?,
        _ => return None,
    };
    let mut items = Vec::new();
    for part in children(body) {
        if part.kind() == "enum_body_declarations" {
            items.extend(children(part));
        } else {
            items.push(part);
        }
    }
    Some(items)
}

fn is_comment(node: Node) -> bool {
    node.kind().ends_with("comment")
}

/// Error Prone's `replaceIncludingComments`: replaces a member and the comments just before it, up to a blank line.
pub fn replace_including_comments(context: &Context, member: Node, replacement: &str) -> Fix {
    let plain = || Fix::replace(member.start_byte(), member.end_byte(), replacement);
    let Some(items) = body_items(member) else { return plain() };
    let Some(at) = items.iter().position(|item| item.id() == member.id()) else { return plain() };
    let is_member = |item: &Node| item.is_named() && !is_comment(*item);
    let mut boundary = items[..at].iter().rev().find(|item| is_member(item)).map(|item| item.end_byte());
    if boundary.is_none() {
        boundary = items.iter().find(|item| item.kind() == "{").map(|brace| brace.end_byte());
    }
    let boundary = boundary.unwrap_or(member.start_byte());
    let mut tokens: Vec<Node> = items[..at].iter().filter(|item| item.start_byte() >= boundary && !is_comment(**item)).copied().collect();
    let mut before = boundary;
    if tokens.first().is_some_and(|token| token.kind() == ";") {
        before = tokens.remove(0).end_byte();
    }
    let first = tokens.first().map_or(member.start_byte(), |token| token.start_byte());
    let mut comments: Vec<Node> = items[..at].iter().filter(|item| is_comment(**item) && item.start_byte() >= before && item.end_byte() <= first).copied().collect();
    if comments.is_empty() {
        return Fix::replace(first, member.end_byte(), replacement);
    }
    comments.sort_by_key(|comment| std::cmp::Reverse(comment.start_byte()));
    let mut start = member.start_byte();
    for comment in comments {
        let between = &context.file.text[comment.end_byte() - 1..start];
        if between.matches('\n').count() > 1 {
            break;
        }
        start = comment.start_byte();
    }
    Fix::replace(start, member.end_byte(), replacement)
}

/// The name of the class a member declaration belongs to.
pub fn owner_class(context: &Context, member: Node) -> Option<String> {
    crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, member)
}
