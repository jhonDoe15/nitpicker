//! From a reference in the tree to the target it names.
use super::Analysis;
use crate::typescript::types::nodes::NodeTable;
use crate::typescript::types::server::Symbol;
use crate::typescript::types::tables::kind as K;
use std::rc::Rc;

/// The symbol an identifier or the name of a member access stands for, aliases followed.
pub fn referenced_symbol(analysis: &mut Analysis, path: &str, table: &NodeTable, node: u32) -> Result<Option<Rc<Symbol>>, String> {
    let identifier = if table.kind(node) == K::PROPERTY_ACCESS_EXPRESSION { table.child(node, "name").unwrap_or(node) } else { node };
    let parent = table.parent(identifier);
    let shorthand = parent.filter(|parent| table.kind(*parent) == K::SHORTHAND_PROPERTY_ASSIGNMENT && table.child(*parent, "name") == Some(identifier));
    let symbol = match shorthand {
        Some(parent) => {
            let found: Option<Symbol> = analysis.session.ask("getShorthandAssignmentValueSymbol", serde_json::json!({ "location": table.handle(parent, path) }))?;
            found.map(Rc::new)
        }
        None => analysis.session.symbol_at(&table.handle(identifier, path))?,
    };
    analysis.session.resolved(symbol)
}

pub fn target_of_symbol(analysis: &Analysis, symbol: Option<&Symbol>) -> Option<usize> {
    symbol?.declarations.iter().find_map(|declaration| analysis.registry.by_declaration.get(declaration).copied())
}

pub fn target_of(analysis: &mut Analysis, path: &str, table: &NodeTable, node: u32) -> Result<Option<usize>, String> {
    let symbol = referenced_symbol(analysis, path, table, node)?;
    Ok(target_of_symbol(analysis, symbol.as_deref()))
}

/// The name node of a declaration, as the compiler's `getNameOfDeclaration` gives it. Declarations made by
/// assignments have rules of their own that are not ported: the check then stops and the caller falls back.
pub fn name_of_declaration(table: &NodeTable, declaration: u32) -> Result<Option<u32>, String> {
    match table.kind(declaration) {
        K::IDENTIFIER => Ok(Some(declaration)),
        K::EXPORT_ASSIGNMENT => Ok(table.child(declaration, "expression").filter(|expression| table.kind(*expression) == K::IDENTIFIER)),
        K::CALL_EXPRESSION | K::BINARY_EXPRESSION | K::ELEMENT_ACCESS_EXPRESSION => Err("a target is also declared by an assignment".to_string()),
        K::FUNCTION_EXPRESSION | K::ARROW_FUNCTION | K::CLASS_EXPRESSION => Err("a target is also declared by an unnamed expression".to_string()),
        kind if (K::FIRST_JS_DOC_NODE..=K::LAST_JS_DOC_NODE).contains(&kind) => Err("a target is also declared in a documentation comment".to_string()),
        _ => Ok(table.child(declaration, "name")),
    }
}
