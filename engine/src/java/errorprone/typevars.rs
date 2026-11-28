//! The suggested fixes of TypeParameterNaming: Error Prone's `SuggestedFixes.renameTypeParameter` and the names it suggests.
use super::Context;
use super::doc::Kind;
use super::fixes::Fix;
use super::javadoc::doc_of;
use super::names::lowercase_terms;
use crate::engine::source::{children, parent, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::scope::type_parameter;
use tree_sitter::Node;

const SCOPES: &[&str] = &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration", "method_declaration", "constructor_declaration"];

fn upper_camel(term: &str) -> String {
    let mut letters = term.chars();
    letters.next().map(|first| first.to_ascii_uppercase().to_string() + letters.as_str()).unwrap_or_default()
}

/// The classification `TypeParameterNamingClassification.classify` gives: whether the name is valid, and whether it ends in T without being UpperCamelCase.
pub fn valid_name(name: &str) -> bool {
    let mut letters = name.chars();
    if letters.next().is_some_and(|first| first.is_ascii_uppercase()) && letters.all(|rest| rest.is_ascii_digit()) {
        return true;
    }
    name.ends_with('T') && lowercase_terms(name).iter().map(|term| upper_camel(term)).collect::<String>() == name
}

/// A name ending in T that is not UpperCamelCase gets no suggestion of the form `FooT`.
pub fn non_class_name_with_t(name: &str) -> bool {
    name.ends_with('T') && !valid_name(name)
}

pub fn followed_with_t(identifier: &str) -> String {
    let letters: Vec<char> = identifier.chars().collect();
    if letters.len() > 2 && letters[0] == 'T' && letters[1].is_ascii_uppercase() && letters[2].is_ascii_lowercase() {
        let rest: String = letters[1..].iter().collect();
        return lowercase_terms(&rest).iter().map(|term| upper_camel(term)).collect::<String>() + "T";
    }
    let terms = lowercase_terms(identifier);
    if let [only] = terms.as_slice() {
        if only.to_ascii_uppercase() == identifier {
            return upper_camel(only) + "T";
        }
    }
    if terms.last().is_some_and(|last| last == "type") {
        return terms[..terms.len() - 1].iter().map(|term| upper_camel(term)).collect::<String>() + "T";
    }
    format!("{identifier}T")
}

fn parameter_names(context: &Context, declaration: Node) -> Vec<String> {
    let list = declaration.child_by_field_name("type_parameters").or_else(|| children(declaration).into_iter().find(|child| child.kind() == "type_parameters"));
    let parameters = list.map(children).unwrap_or_default();
    parameters
        .into_iter()
        .filter(|parameter| parameter.kind() == "type_parameter")
        .filter_map(|parameter| children(parameter).into_iter().find(|part| matches!(part.kind(), "type_identifier" | "identifier")))
        .map(|name| context.text(name).to_string())
        .collect()
}

/// Static as javac's symbol has it: declared so, or a type that is implicitly.
fn is_interface(declaration: Node) -> bool {
    matches!(declaration.kind(), "interface_declaration" | "annotation_type_declaration")
}

/// javac's `isStatic`: declared static, implicitly static, or a class that is a member of an interface.
fn is_static(declaration: Node) -> bool {
    let in_interface = declaration.kind() != "method_declaration" && parent(declaration).and_then(parent).is_some_and(is_interface);
    has_modifier(declaration, "static") || in_interface || matches!(declaration.kind(), "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration")
}

/// The type variables of the declaration and of every declaration around it that its code can still use, outermost first.
fn enclosing_variables(context: &Context, owner: Node) -> Vec<String> {
    let mut found = Vec::new();
    if is_interface(owner) {
        return found;
    }
    let mut current = owner;
    loop {
        found.splice(0..0, parameter_names(context, current));
        if is_static(current) {
            break;
        }
        let mut above = parent(current);
        while above.is_some_and(|node| !SCOPES.contains(&node.kind())) {
            above = above.and_then(parent);
        }
        match above {
            Some(node) => current = node,
            None => break,
        }
    }
    found
}

/// `firstLetterReplacementName`: T -> T2, T2 -> T3, skipping what is taken.
fn first_letter_replacement(name: &str, in_scope: &[String]) -> String {
    let base: String = name.chars().take(1).collect();
    let mut number = 2usize;
    let mut first = true;
    let mut name = name;
    let digits = name.len() - name.trim_end_matches(|letter: char| letter.is_ascii_digit()).len();
    if digits > 0 && digits < name.len() {
        number = name[name.len() - digits..].parse::<usize>().map_or(2, |given| given + 1);
        name = &name[..name.len() - digits];
    }
    let mut replacement = String::new();
    for variable in in_scope {
        if variable == name {
            if number == 2 && first {
                return base;
            }
            break;
        } else if variable.chars().next() == name.chars().next() {
            if first {
                first = false;
            } else {
                number += 1;
            }
            replacement = format!("{base}{number}");
        }
    }
    while in_scope.contains(&replacement) {
        number += 1;
        replacement = format!("{base}{number}");
    }
    replacement
}

pub fn single_letter(context: &Context, owner: Node, name: &str) -> String {
    let first = lowercase_terms(name).first().and_then(|term| term.chars().next()).or_else(|| name.chars().next()).unwrap_or('T').to_ascii_uppercase();
    let in_scope = enclosing_variables(context, owner);
    let clashes = in_scope.iter().any(|variable| variable.starts_with(first) && !valid_name(variable));
    if clashes { first_letter_replacement(name, &in_scope) } else { first.to_string() }
}

/// `SuggestedFixes.renameTypeParameter`: the declaration, every use in its owner, and its `@param <T>` in the owner's doc comment.
pub fn rename(context: &Context, owner: Node, parameter: Node, name: &str, replacement: &str) -> Fix {
    let at = parameter.start_byte();
    let mut fix = Fix::replace(at, at + name.len(), replacement);
    walk(owner, |node| {
        if node.kind() == "type_identifier" && node.start_byte() != at && context.text(node) == name {
            if type_parameter(context.file, node, name).is_some_and(|found| found.id() == parameter.id()) {
                fix = std::mem::take(&mut fix).and(node.start_byte(), node.end_byte(), replacement);
            }
        }
    });
    if let Some((comment, doc)) = doc_of(context, owner) {
        doc.visit(&mut |tree, _| {
            let generic = comment.text[..tree.pos].iter().rev().find(|letter| !super::doc::is_space(**letter)) == Some(&'<');
            if tree.kind == Kind::Identifier && tree.name == name && generic {
                if let (Some(from), Some(to)) = (comment.source_pos(tree.pos), comment.source_pos(tree.end)) {
                    fix = std::mem::take(&mut fix).and(from, to, replacement);
                }
            }
        });
    }
    fix
}
