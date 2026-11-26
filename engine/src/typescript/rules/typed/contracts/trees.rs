//! What the handler rule reads from the compiler's tree: the class a method is in, and the pieces of a property
//! access (what it reads from, its name and its text) and of a call.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::nodes::{NodeTable, parse_handle};
use crate::typescript::types::tables::kind as k;
use std::rc::Rc;

/// The class a member is declared in: its handle and name, and the text of the member's name.
pub struct Member {
    pub class: String,
    pub class_name: Option<String>,
    pub name_text: String,
}

/// A property access `object.name`: the handle of the object, the name, and the text of the whole access.
pub struct Access {
    pub object: String,
    pub name: String,
    pub text: String,
}

impl Types {
    pub(super) fn tree_of_handle(&mut self, handle: &str) -> Option<(Rc<NodeTable>, u32, String)> {
        let (index, _, path) = parse_handle(handle)?;
        let table = self.table_of(path)?;
        Some((table, index, path.to_string()))
    }

    /// The class that holds a member, when the member is in a class declaration or a class expression.
    pub fn class_member(&mut self, member: &str) -> Option<Member> {
        let (table, index, path) = self.tree_of_handle(member)?;
        let parent = table.parent(index).filter(|parent| matches!(table.kind(*parent), k::CLASS_DECLARATION | k::CLASS_EXPRESSION))?;
        let name = table.child(index, "name")?;
        Some(Member {
            class: table.handle(parent, &path),
            class_name: table.child(parent, "name").and_then(|name| table.text(name)).map(|name| name.into_owned()),
            name_text: table.node_text(name).to_string(),
        })
    }

    /// The pieces of a node that is a property access (`a.b`, not `a[b]`).
    pub fn access_of(&mut self, handle: &str) -> Option<Access> {
        let (table, index, path) = self.tree_of_handle(handle)?;
        if table.kind(index) != k::PROPERTY_ACCESS_EXPRESSION {
            return None;
        }
        let name = table.child(index, "name").and_then(|name| table.text(name))?.into_owned();
        let object = table.child(index, "expression")?;
        Some(Access { object: table.handle(object, &path), name, text: table.node_text(index).to_string() })
    }

    /// The callee of a call: the handle of its `expression`.
    pub fn callee_of(&mut self, call: &str) -> Option<String> {
        let (table, index, path) = self.tree_of_handle(call)?;
        Some(table.handle(table.child(index, "expression")?, &path))
    }
}
