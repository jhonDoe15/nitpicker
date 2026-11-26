//! The literal members of the union a compared value has, the alias it was declared as, and whether that is
//! written in the project's own files.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::nodes::parse_handle;
use crate::typescript::types::server::{Symbol, Type};
use crate::typescript::types::tables::type_flags;
use serde_json::json;

#[derive(Clone, Debug, PartialEq)]
pub enum Literal {
    Text(String),
    Number(f64),
}

impl Types {
    /// The type of the value with this extent and its string and number literal members when it is a union.
    pub fn literal_members(&mut self, start: u32, end: u32) -> Option<(Type, Vec<Literal>)> {
        let found = self.type_at(start, end)?;
        if found.flags & type_flags::UNION == 0 {
            return Some((found, Vec::new()));
        }
        let literals = self
            .parts(&found)
            .iter()
            .filter_map(|member| match (&member.value, member.flags & type_flags::STRING_OR_NUMBER_LITERAL) {
                (Some(serde_json::Value::String(text)), flag) if flag == type_flags::STRING_LITERAL => Some(Literal::Text(text.clone())),
                (Some(serde_json::Value::Number(number)), flag) if flag == type_flags::NUMBER_LITERAL => number.as_f64().map(Literal::Number),
                _ => None,
            })
            .collect();
        Some((found, literals))
    }

    fn declared_alias(&mut self, kind: &Type) -> Option<Symbol> {
        let stripped = self.non_nullable(kind)?;
        self.alias_symbol(&stripped)
    }

    fn symbol_at_extent(&mut self, start: u32, end: u32) -> Option<std::rc::Rc<Symbol>> {
        let handle = self.handle_at(None, start, end)?;
        let found = self.session.symbol_at(&handle);
        self.answered(found)
    }

    /// The alias of the union a value was declared as: its own type's, or else the type of the symbol's
    /// declaration.
    pub fn alias_of_value(&mut self, kind: &Type, start: u32, end: u32) -> Option<Symbol> {
        if let Some(direct) = self.declared_alias(kind) {
            return Some(direct);
        }
        let symbol = self.symbol_at_extent(start, end)?;
        let declaration = symbol.value_declaration.clone()?;
        let found: Result<Option<Type>, String> = self.session.ask("getTypeOfSymbolAtLocation", json!({ "symbol": symbol.id, "location": declaration }));
        let declared = self.answered(found)?;
        self.declared_alias(&declared)
    }

    fn is_project_declaration(&mut self, declaration: &str) -> bool {
        let in_dependencies = parse_handle(declaration).is_some_and(|(_, _, path)| path.contains("/node_modules/"));
        !(self.file_kind(declaration).default_library || in_dependencies)
    }

    fn has_type_annotation(&mut self, declaration: &str) -> bool {
        let Some((index, _, path)) = parse_handle(declaration) else { return false };
        self.table_of(path).is_some_and(|table| table.child(index, "type").is_some())
    }

    /// Whether the alias is declared, or without one the value is annotated, in a file of the project.
    pub fn is_written_in_project(&mut self, alias: Option<&Symbol>, start: u32, end: u32) -> bool {
        let declarations = match alias {
            Some(alias) => alias.declarations.clone(),
            None => {
                let Some(symbol) = self.symbol_at_extent(start, end) else { return false };
                symbol.declarations.iter().filter(|declaration| self.has_type_annotation(declaration)).cloned().collect()
            }
        };
        declarations.iter().any(|declaration| self.is_project_declaration(declaration))
    }

    /// Whether the type of the value with this extent, without null and undefined, is a union.
    pub fn is_union_at(&mut self, start: u32, end: u32) -> Option<bool> {
        let Some(found) = self.type_at(start, end) else {
            self.refuse("no type for a narrowed object");
            return None;
        };
        let kind = self.non_nullable(&found)?;
        Some(kind.flags & type_flags::UNION != 0)
    }
}
