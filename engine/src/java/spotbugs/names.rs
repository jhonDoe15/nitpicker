//! Names as SpotBugs prints them: binary class names, methods with the simple names of their erased parameters.
use super::Context;
use crate::java::types::model::Type;
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

/// `pkg.Outer$Inner` for the index's `pkg.Outer.Inner`.
pub fn binary(context: &Context, class: &str) -> String {
    let package = match context.resolver.index.get(class) {
        Some(info) => info.package.clone(),
        None => {
            let parts: Vec<&str> = class.split('.').collect();
            let first_class = parts.iter().position(|part| part.starts_with(|c: char| c.is_uppercase() || c.is_ascii_digit()));
            parts[..first_class.unwrap_or(parts.len().saturating_sub(1))].join(".")
        }
    };
    if package.is_empty() || !class.starts_with(&format!("{package}.")) {
        return class.replace('.', "$");
    }
    format!("{package}.{}", class[package.len() + 1..].replace('.', "$"))
}

pub fn package_of(binary: &str) -> &str {
    binary.rsplit_once('.').map_or("", |(package, _)| package)
}

/// The binary name without its package.
pub fn short(binary: &str) -> &str {
    binary.rsplit_once('.').map_or(binary, |(_, simple)| simple)
}

/// An erased type the way a method signature shows it.
pub fn simple(context: &Context, kind: &Type) -> String {
    match kind {
        Type::Array(element) => format!("{}[]", simple(context, element)),
        Type::Class(name, _) => short(&binary(context, name.split('&').next().unwrap_or(name))).to_string(),
        other => other.erased().name().rsplit('.').next().unwrap_or_default().to_string(),
    }
}

/// `pkg.Class.method(A, B)`, or `new pkg.Class(A, B)` for a constructor. An inner class takes its outer instance first.
pub fn method(context: &Context, class: &str, declaration: Node, outer: Option<&str>) -> String {
    let (erased, _, _) = context.resolver.parameters(declaration.child_by_field_name("parameters"));
    let mut shown: Vec<String> = outer.map(|outer| short(&binary(context, outer)).to_string()).into_iter().collect();
    shown.extend(erased.iter().map(|kind| simple(context, kind)));
    let owner = binary(context, class);
    if TYPE_DECLARATIONS.contains(&declaration.kind()) || declaration.kind().ends_with("constructor_declaration") {
        return format!("new {owner}({})", shown.join(", "));
    }
    let name = declaration.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    format!("{owner}.{name}({})", shown.join(", "))
}

/// A field as a message names it from inside `from`: without the package when both are in the same one.
pub fn field(context: &Context, from: &str, declaring: &str, name: &str) -> String {
    let (from, declaring) = (binary(context, from), binary(context, declaring));
    if package_of(&from) == package_of(&declaring) {
        format!("{}.{name}", short(&declaring))
    } else {
        format!("{declaring}.{name}")
    }
}
