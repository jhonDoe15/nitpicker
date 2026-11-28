//! Questions of the promise rules: the type of a node of any file by its handle, whether a value has a callable
//! `then`, and the declarations a callee name resolves to.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::nodes::NodeTable;
use crate::typescript::types::server::Type;
use crate::typescript::types::tables::type_flags;
use std::rc::Rc;

impl Types {
    /// The node table of any file of the program.
    pub fn table_of(&mut self, path: &str) -> Option<Rc<NodeTable>> {
        let table = self.session.table(path);
        self.answered(table.map(Some))
    }

    /// `getTypeAtLocation` of the compiler's node with this handle.
    pub fn type_at_handle(&mut self, handle: &str) -> Option<Type> {
        let found = self.session.types_at(&[handle.to_string()]);
        self.answered(found).pop().flatten()
    }

    /// Whether some member of the node's type has a `then` property that can be called.
    pub fn is_thenable_at(&mut self, handle: &str) -> bool {
        let key = format!("thenable:{handle}");
        if let Some(known) = self.kept.get(&key) {
            return *known;
        }
        let found = self.thenable_parts(handle);
        if self.refused.is_none() {
            self.kept.insert(key, found);
        }
        found
    }

    fn thenable_parts(&mut self, handle: &str) -> bool {
        let Some(kind) = self.type_at_handle(handle) else { return false };
        let parts = if kind.flags & type_flags::UNION != 0 { self.parts(&kind).to_vec() } else { vec![kind] };
        for part in parts {
            let Some(apparent) = self.apparent(&part) else { continue };
            let Some(then) = self.property(&apparent, "then") else { continue };
            let found = self.session.server.type_of_symbol_at(&self.session.project, then.id, handle);
            let Some(callable) = self.answered(found) else { continue };
            if self.signature_count(&callable, false) > 0 {
                return true;
            }
        }
        false
    }

    /// The declarations of what the node names, as handles: the symbol at the node, through an alias.
    pub fn declarations_at(&mut self, handle: &str) -> Vec<String> {
        let found = self.session.symbol_at(handle);
        let symbol = self.answered(found.map(Some)).flatten();
        let resolved = self.session.resolved(symbol);
        let symbol = self.answered(resolved.map(Some)).flatten();
        symbol.map(|symbol| symbol.declarations.clone()).unwrap_or_default()
    }
}
