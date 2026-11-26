use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use oxc_semantic::SymbolId;

/// `sourceCode.getDeclaredVariables(owner)` for the bindings of one pattern.
pub fn declared<'s>(scopes: &Scopes<'_, 's>, pattern: Node<'s>, owner: Node<'s>) -> Vec<SymbolId> {
    let mut found: Vec<SymbolId> = Vec::new();
    for symbol in pattern.descendants().into_iter().filter(|node| node.is("Identifier")).filter_map(|node| scopes.variable_named(node)) {
        if !found.contains(&symbol) && scopes.defs(symbol).iter().any(|definition| definition.node == owner) {
            found.push(symbol);
        }
    }
    found
}

/// `constAlias`: the variable declared by `const alias = <reference>`.
fn const_alias<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> Vec<SymbolId> {
    let Some(declarator) = identifier.parent().filter(|parent| parent.is("VariableDeclarator")) else { return Vec::new() };
    let is_const = declarator.parent().is_some_and(|declaration| declaration.text("kind").as_deref() == Some("const"));
    match declarator.node("id") {
        Some(id) if declarator.node("init") == Some(identifier) && is_const && id.is("Identifier") => declared(scopes, id, declarator),
        _ => Vec::new(),
    }
}

/// The identifier ranges of every reference to the caught variables and to their `const` aliases.
pub fn reference_ranges(scopes: &Scopes<'_, '_>, caught: &[SymbolId]) -> Vec<(u32, u32)> {
    let mut variables = caught.to_vec();
    for symbol in caught {
        for reference in scopes.references(*symbol) {
            variables.extend(const_alias(scopes, reference.identifier));
        }
    }
    variables
        .into_iter()
        .flat_map(|symbol| scopes.references(symbol))
        .map(|reference| (reference.identifier.start(), reference.identifier.end()))
        .collect()
}

/// `referencesCatch`: some reference lies inside the expression.
pub fn references_catch(ranges: &[(u32, u32)], expression: Node) -> bool {
    ranges.iter().any(|(start, end)| expression.start() <= *start && *end <= expression.end())
}
