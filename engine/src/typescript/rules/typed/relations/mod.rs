//! Questions of the lazy relation rule.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::tables::type_flags;

impl Types {
    /// `getTypeAtLocation` of the node with this handle: whether it is `any`, and the name of
    /// `type.aliasSymbol ?? type.getSymbol()`. Refuses when the compiler gives no type.
    pub fn type_name_at_handle(&mut self, handle: &str) -> Option<(bool, Option<String>)> {
        let Some(kind) = self.type_at_handle(handle) else {
            self.refuse("the compiler has no type for a relation's receiver");
            return None;
        };
        let any = kind.flags & type_flags::ANY != 0;
        let name = if kind.alias_symbol.is_some() { self.alias_symbol(&kind).map(|symbol| symbol.name) } else { self.symbol(&kind).map(|symbol| symbol.name.clone()) };
        Some((any, name))
    }
}

impl Types {
    /// The declarations of `type.getProperty(name)` for the type of the node with this handle; the name goes to
    /// the compiler as written, as `getProperty` takes it.
    pub fn property_declarations_named(&mut self, handle: &str, name: &str) -> Vec<String> {
        let Some(kind) = self.type_at_handle(handle) else { return Vec::new() };
        self.property(&kind, name).map(|symbol| symbol.declarations.clone()).unwrap_or_default()
    }
}
