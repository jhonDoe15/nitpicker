//! `moduleScope(...).families.has('typeorm')`: whether a file binds a name to `typeorm` or `@nestjs/typeorm`,
//! by `import`, `import x = require()`, `require()` or `import()`.
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::writes::imports::loaded_module;
use crate::typescript::rules::writes::syntax::string_value;
use std::collections::HashMap;

fn statements(program: Node) -> Vec<Node> {
    program
        .nodes("body")
        .into_iter()
        .map(|statement| match statement.node("declaration") {
            Some(declaration) if statement.is("ExportNamedDeclaration") => declaration,
            _ => statement,
        })
        .collect()
}

fn pattern_locals(pattern: Node) -> Vec<String> {
    if pattern.is("Identifier") {
        return pattern.name().map(|name| vec![name.into_owned()]).unwrap_or_default();
    }
    if !pattern.is("ObjectPattern") {
        return Vec::new();
    }
    pattern
        .nodes("properties")
        .into_iter()
        .filter(|property| property.is("Property"))
        .filter_map(|property| property.node("value").filter(|value| value.is("Identifier")).and_then(|value| value.name()).map(|name| name.into_owned()))
        .collect()
}

fn statement_bindings(statement: Node) -> Vec<(String, String)> {
    if statement.is("ImportDeclaration") {
        let source = statement.node("source").and_then(|source| source.text("value")).map(|text| text.into_owned()).unwrap_or_default();
        return statement
            .nodes("specifiers")
            .into_iter()
            .filter_map(|specifier| specifier.node("local").and_then(|local| local.name()).map(|name| (name.into_owned(), source.clone())))
            .collect();
    }
    if statement.is("TSImportEqualsDeclaration") {
        let reference = statement.node("moduleReference").filter(|reference| reference.is("TSExternalModuleReference"));
        let source = reference.and_then(|reference| string_value(reference.node("expression")));
        let local = statement.node("id").and_then(|id| id.name());
        return source.zip(local).map(|(source, local)| vec![(local.into_owned(), source)]).unwrap_or_default();
    }
    if !statement.is("VariableDeclaration") {
        return Vec::new();
    }
    let mut found = Vec::new();
    for declarator in statement.nodes("declarations") {
        let Some(source) = loaded_module(declarator.node("init")) else { continue };
        let locals = declarator.node("id").map(pattern_locals).unwrap_or_default();
        found.extend(locals.into_iter().map(|local| (local, source.clone())));
    }
    found
}

pub fn uses_typeorm(program: Node) -> bool {
    let bindings: HashMap<String, String> = statements(program).into_iter().flat_map(statement_bindings).collect();
    bindings.values().any(|source| source == "typeorm" || source == "@nestjs/typeorm")
}
