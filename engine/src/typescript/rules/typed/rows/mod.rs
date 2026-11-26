//! What the query-row rules ask the compiler: the row type of an awaited query, whether a field of it is a
//! mapped column, the package of a called method, and whether the row class has hooks a bulk statement skips.
mod hooks;

pub use hooks::{HookIndex, HookStatus};

use crate::typescript::rules::effects::packages::package_from_path;
use crate::typescript::rules::query_rows::calls::orm_family_of;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::rules::typed::versions::trees::{decorator_name, decorators};
use crate::typescript::types::nodes::parse_handle;
use crate::typescript::types::server::Type;
use crate::typescript::types::tables::{kind, type_flags};

const LOOSE_TYPES: u32 = type_flags::ANY | type_flags::UNKNOWN;
const PRISMA_PACKAGES: [&str; 2] = ["@prisma/client", ".prisma/client"];
const PRISMA_RUNTIME: &str = "@prisma/client/runtime";
const COLUMN_DECORATORS: [&str; 15] = [
    "Column", "PrimaryColumn", "PrimaryGeneratedColumn", "CreateDateColumn", "UpdateDateColumn", "DeleteDateColumn", "VersionColumn",
    "ObjectIdColumn", "Property", "PrimaryKey", "Enum", "AllowNull", "AutoIncrement", "Default", "Unique",
];

impl Types {
    /// `getIndexTypeOfType(getTypeAtLocation(awaited), IndexKind.Number)`, `None` when there is none or it is
    /// `any` or `unknown`.
    pub(crate) fn row_element(&mut self, start: u32, end: u32) -> Option<Type> {
        let handle = self.handle_at(Some(kind::AWAIT_EXPRESSION), start, end)?;
        let Some(rows) = self.type_at_handle(&handle) else {
            self.refuse("no type for loaded rows");
            return None;
        };
        self.entity_number_index(&rows).filter(|element| element.flags & LOOSE_TYPES == 0)
    }

    fn is_column(&mut self, declaration: &str) -> bool {
        let Some((index, found, _)) = parse_handle(declaration) else { return false };
        if found != kind::PROPERTY_DECLARATION && found != kind::PROPERTY_SIGNATURE {
            return false;
        }
        let Some((table, _, _)) = self.entity_tree(declaration) else { return false };
        let names: Vec<String> = decorators(&table, index).into_iter().map(|decorator| decorator_name(&table, decorator).unwrap_or_default()).collect();
        names.is_empty() || names.iter().any(|name| COLUMN_DECORATORS.contains(&name.as_str()))
    }

    /// `isModelField`: every declaration of the row's field is a property mapped as a column.
    pub fn is_model_field(&mut self, start: u32, end: u32, name: &str) -> bool {
        let Some(element) = self.row_element(start, end) else { return false };
        let declarations = self.property(&element, name).map(|symbol| symbol.declarations.clone()).unwrap_or_default();
        !declarations.is_empty() && declarations.iter().all(|declaration| self.is_column(declaration))
    }

    fn mentions_prisma_runtime(&mut self, path: &str) -> bool {
        let key = format!("prisma-runtime:{path}");
        if let Some(known) = self.kept.get(&key) {
            return *known;
        }
        let found = std::fs::read_to_string(path).is_ok_and(|text| text.contains(PRISMA_RUNTIME));
        self.kept.insert(key, found);
        found
    }

    /// `isForeignCall`: the call resolves to a signature declared outside every ORM package.
    pub fn is_foreign_call(&mut self, start: u32, end: u32) -> bool {
        let Some(declaration) = self.resolved_declaration(kind::CALL_EXPRESSION, start, end) else { return false };
        let Some((_, _, path)) = parse_handle(&declaration) else { return false };
        let path = path.to_string();
        match package_from_path(&path) {
            Some(name) => !PRISMA_PACKAGES.contains(&name.as_str()) && orm_family_of(&name).is_none(),
            None => !self.mentions_prisma_runtime(&path),
        }
    }
}
