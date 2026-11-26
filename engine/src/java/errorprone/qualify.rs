//! `SuggestedFixes.qualifyType`: the name to write for a class at a place, simple when it is visible or free to import.
use super::Context;
use crate::java::types::model::Type;
use tree_sitter::Node;

/// The class as it can be written at `at`: the simple name when it already means that class or nothing, else qualified.
pub fn qualify(context: &Context, at: Node, full: &str) -> String {
    let package = context.resolver.index.get(full).map(|info| info.package.clone()).unwrap_or_else(|| {
        let lower: Vec<&str> = full.split('.').take_while(|part| part.starts_with(|c: char| c.is_lowercase())).collect();
        lower.join(".")
    });
    let rest = if package.is_empty() { full } else { full.strip_prefix(&format!("{package}.")).unwrap_or(full) };
    let parts: Vec<&str> = rest.split('.').collect();
    for end in (0..parts.len()).rev() {
        let current = if package.is_empty() { parts[..=end].join(".") } else { format!("{package}.{}", parts[..=end].join(".")) };
        let found = context.resolver.class_name(at, parts[end]);
        if found.as_deref() == Some(current.as_str()) {
            return parts[end..].join(".");
        }
        if end == 0 {
            return if found.is_some() && !package.is_empty() { full.to_string() } else { parts.join(".") };
        }
    }
    full.to_string()
}

/// A type written for a fix: type arguments kept, each class named with `qualify`.
pub fn qualify_type(context: &Context, at: Node, kind: &Type) -> String {
    match kind {
        Type::Class(name, arguments) => {
            let base = qualify(context, at, name);
            if arguments.is_empty() {
                return base;
            }
            let shown: Vec<String> = arguments.iter().map(|argument| qualify_type(context, at, argument)).collect();
            format!("{base}<{}>", shown.join(", "))
        }
        Type::Array(element) => format!("{}[]", qualify_type(context, at, element)),
        Type::Variable(name) => name.clone(),
        Type::Primitive(name) => (*name).to_string(),
        Type::Wildcard => "?".to_string(),
        Type::Null => "null".to_string(),
    }
}
