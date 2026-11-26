//! Facts of declarations that the contract and handler rules read from the compiler's tree: modifiers, private
//! names, decorators and where each decorator comes from, type aliases and what encloses a declaration.
use crate::typescript::rules::typed::types::{Types, is_declaration_file};
use crate::typescript::types::nodes::{NodeTable, parse_handle};
use crate::typescript::types::server::Symbol;
use crate::typescript::types::tables::kind as k;

const DECORATABLE: [u32; 7] = [k::PARAMETER, k::PROPERTY_DECLARATION, k::METHOD_DECLARATION, k::GET_ACCESSOR, k::SET_ACCESSOR, k::CLASS_EXPRESSION, k::CLASS_DECLARATION];
const SCRIPT_EXTENSIONS: [&str; 4] = [".js", ".jsx", ".mjs", ".cjs"];

/// A decorator's callee, followed through its import to what it names: the name, and the file that declares it.
pub struct Origin {
    pub name: String,
    pub file: String,
}

/// An alias of a type: whether the declaration is directly in a source file, and what it is declared as.
pub struct AliasFacts {
    pub top_level: bool,
    pub literal: bool,
    pub default_selection: bool,
}

fn hides(table: &NodeTable, node: u32) -> bool {
    table.has_modifier(node, k::PRIVATE_KEYWORD) || table.has_modifier(node, k::PROTECTED_KEYWORD)
}

fn combined_hidden(table: &NodeTable, index: u32) -> bool {
    let mut node = index;
    if table.kind(node) == k::BINDING_ELEMENT {
        while matches!(table.kind(node), k::BINDING_ELEMENT | k::OBJECT_BINDING_PATTERN | k::ARRAY_BINDING_PATTERN) {
            let Some(parent) = table.parent(node) else { break };
            node = parent;
        }
    }
    let mut hidden = hides(table, node);
    for expected in [k::VARIABLE_DECLARATION, k::VARIABLE_DECLARATION_LIST] {
        if table.kind(node) == expected {
            let Some(parent) = table.parent(node) else { return hidden };
            node = parent;
            hidden |= expected == k::VARIABLE_DECLARATION_LIST && hides(table, node);
        }
    }
    hidden || (table.kind(node) == k::VARIABLE_STATEMENT && hides(table, node))
}

fn is_script(path: &str) -> bool {
    SCRIPT_EXTENSIONS.iter().any(|extension| path.ends_with(extension))
}

impl Types {
    /// `getCombinedModifierFlags` has no `private` or `protected`, and the name is no private identifier.
    pub fn is_public(&mut self, symbol: &Symbol) -> bool {
        symbol.declarations.iter().all(|declaration| self.declaration_is_public(declaration))
    }

    fn declaration_is_public(&mut self, declaration: &str) -> bool {
        let Some((table, index, path)) = self.tree_of_handle(declaration) else { return true };
        if is_script(&path) {
            let leading = table.source().slice(table.pos(index), table.start(index));
            if leading.contains("@private") || leading.contains("@protected") {
                self.refuse("a JSDoc modifier tag on a member");
            }
        }
        let name = table.child(index, "name").unwrap_or(index);
        !combined_hidden(&table, index) && table.kind(name) != k::PRIVATE_IDENTIFIER
    }

    /// Whether some declaration of the symbol is in a source file and not in a declaration file.
    pub fn is_project_declared(&self, symbol: &Symbol) -> bool {
        symbol.declarations.iter().any(|declaration| parse_handle(declaration).is_some_and(|(_, _, path)| !is_declaration_file(path)))
    }

    /// The declarations of the symbol that are class declarations or class expressions.
    pub fn class_declarations(&self, symbol: &Symbol) -> Vec<String> {
        let is_class = |declaration: &&String| parse_handle(declaration).is_some_and(|(_, kind, _)| kind == k::CLASS_DECLARATION || kind == k::CLASS_EXPRESSION);
        symbol.declarations.iter().filter(is_class).cloned().collect()
    }

    /// The decorators of a declaration, each one followed through its import: `getDecorators` with the origin of
    /// each decorator's callee (the name of a property access, a call's function).
    pub fn decorator_origins(&mut self, declaration: &str) -> Vec<Origin> {
        let Some((table, index, path)) = self.tree_of_handle(declaration) else { return Vec::new() };
        if !DECORATABLE.contains(&table.kind(index)) {
            return Vec::new();
        }
        let mut found = Vec::new();
        for decorator in table.listed(index, "modifiers").into_iter().filter(|modifier| table.kind(*modifier) == k::DECORATOR) {
            let Some(mut callee) = table.child(decorator, "expression") else { continue };
            if table.kind(callee) == k::CALL_EXPRESSION {
                callee = table.child(callee, "expression").unwrap_or(callee);
            }
            if table.kind(callee) == k::PROPERTY_ACCESS_EXPRESSION {
                callee = table.child(callee, "name").unwrap_or(callee);
            }
            let Some(target) = self.symbol_named(&table.handle(callee, &path), true) else { continue };
            let file = target.declarations.first().and_then(|first| parse_handle(first)).map(|(_, _, file)| file.to_string());
            found.extend(file.map(|file| Origin { name: target.name.clone(), file }));
        }
        found
    }

    /// What a type alias declaration of the symbol (the first one) is: top level, a type literal, or written
    /// with `DefaultSelection`.
    pub fn alias_facts(&mut self, symbol: &Symbol) -> Option<AliasFacts> {
        let declaration = symbol.declarations.iter().find(|declaration| parse_handle(declaration).is_some_and(|(_, kind, _)| kind == k::TYPE_ALIAS_DECLARATION))?;
        let (table, index, _) = self.tree_of_handle(declaration)?;
        let written = table.child(index, "type");
        Some(AliasFacts {
            top_level: table.parent(index).is_some_and(|parent| table.kind(parent) == k::SOURCE_FILE),
            literal: written.is_some_and(|written| table.kind(written) == k::TYPE_LITERAL),
            default_selection: written.is_some_and(|written| table.node_text(written).contains("DefaultSelection")),
        })
    }

    /// The name and the file of the type alias that encloses a declaration (the declaration itself counts).
    pub fn enclosing_alias(&mut self, declaration: &str) -> Option<(String, String)> {
        let (table, mut index, path) = self.tree_of_handle(declaration)?;
        while table.kind(index) != k::TYPE_ALIAS_DECLARATION {
            index = table.parent(index)?;
        }
        let name = table.child(index, "name").and_then(|name| table.text(name))?;
        Some((name.into_owned(), path))
    }
}
