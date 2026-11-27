//! `schema-libraries.mts`: calls into zod and valibot, by the import their first name comes from.
use super::super::bindings::{base_identifier, import_of, is_from_package};
use super::super::tree::{is_pa, member_text, Tree, T};
use super::Kind;
use crate::typescript::rules::support::view::Node;

pub struct Library {
    pub id: &'static str,
    packages: &'static [&'static str],
    pub objects: &'static [&'static str],
    pub wrappers: &'static [&'static str],
    kinds: &'static [(&'static str, Kind)],
}

impl Library {
    /// `library.kinds[name]`: a plain object, so an inherited name gives a value that is no kind.
    pub fn kind(&self, name: &str) -> Option<Kind> {
        if let Some((_, kind)) = self.kinds.iter().find(|(key, _)| *key == name) {
            return Some(kind.clone());
        }
        super::super::tree::inherited(name).map(Kind::Other)
    }
}

pub struct LibraryCall {
    pub library: &'static Library,
    pub name: Option<String>,
    pub coerce: bool,
    pub display: Option<String>,
}

const ZOD: Library = Library {
    id: "zod",
    packages: &["zod", "nestjs-zod"],
    objects: &["object", "strictObject", "looseObject"],
    wrappers: &["optional", "nullable", "nullish", "array", "readonly", "nonoptional", "default"],
    kinds: &[
        ("number", Kind::Number),
        ("int", Kind::Number),
        ("int32", Kind::Number),
        ("uint32", Kind::Number),
        ("float32", Kind::Number),
        ("float64", Kind::Number),
        ("int64", Kind::Bigint),
        ("uint64", Kind::Bigint),
        ("bigint", Kind::Bigint),
        ("boolean", Kind::Boolean),
        ("date", Kind::Date),
    ],
};

const VALIBOT: Library = Library {
    id: "valibot",
    packages: &["valibot"],
    objects: &["object", "strictObject", "looseObject", "objectWithRest"],
    wrappers: &[
        "optional",
        "nullable",
        "nullish",
        "array",
        "exactOptional",
        "undefinedable",
        "nonOptional",
        "nonNullable",
        "nonNullish",
        "pipe",
        "pipeAsync",
        "fallback",
    ],
    kinds: &[("number", Kind::Number), ("bigint", Kind::Bigint), ("boolean", Kind::Boolean), ("date", Kind::Date)],
};

static LIBRARIES: [Library; 2] = [ZOD, VALIBOT];

pub fn listed(names: &[&str], name: Option<&str>) -> bool {
    name.is_some_and(|name| names.contains(&name))
}

fn library_of(tree: &Tree, identifier: Node) -> Option<&'static Library> {
    LIBRARIES.iter().find(|library| is_from_package(tree, Some(identifier), library.packages))
}

fn namespace_call(tree: &Tree, callee: Node, library: &'static Library) -> Option<LibraryCall> {
    let name = member_text(callee)?;
    let owner = tree.field(callee, "object")?.bare()?;
    if owner.is("Identifier") {
        let display = format!("{}.{name}()", owner.name()?);
        return Some(LibraryCall { library, name: Some(name), coerce: false, display: Some(display) });
    }
    let inner = tree.field(owner, "object").and_then(T::bare).filter(|inner| inner.is("Identifier"));
    match inner {
        Some(inner) if is_pa(owner) && member_text(owner).as_deref() == Some("coerce") => {
            let display = format!("{}.coerce.{name}()", inner.name()?);
            Some(LibraryCall { library, name: Some(name), coerce: true, display: Some(display) })
        }
        _ => None,
    }
}

pub fn library_call(tree: &Tree, node: T) -> Option<LibraryCall> {
    let call = node.bare().filter(|call| call.is("CallExpression"))?;
    let callee = tree.field(call, "callee")?;
    let base = base_identifier(tree, callee)?;
    let library = library_of(tree, base)?;
    let callee_node = callee.bare()?;
    if callee_node.is("Identifier") {
        let imported = import_of(tree, callee_node).and_then(|binding| binding.imported);
        return match imported.as_deref() {
            Some("*" | "default") => None,
            _ => Some(LibraryCall { library, name: imported, coerce: false, display: None }),
        };
    }
    if is_pa(callee_node) { namespace_call(tree, callee_node, library) } else { None }
}

/// `isMethodCall`: a call of a property that is not a library call.
pub fn method_call<'v>(tree: &Tree<'v>, node: T<'v>) -> Option<Node<'v>> {
    let call = node.bare().filter(|call| call.is("CallExpression"))?;
    let callee = tree.field(call, "callee")?.bare().filter(|callee| is_pa(*callee))?;
    library_call(tree, node).is_none().then_some(callee)
}
