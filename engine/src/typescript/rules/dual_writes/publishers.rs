//! `programMayPublish`: whether some file of the program is, or imports, a message broker package. Declaration
//! files are known by their package path; other files by the module names the compiler collects as their
//! `imports`, read from the file's tree (static imports and re-exports, `import x = require()`, `import()` calls
//! and types, and `require()` in JavaScript files).
use crate::typescript::rules::effects::packages::{BROKER_CLIENTS, MESSAGE_PACKAGES, package_from_path};
use crate::typescript::rules::typed::types::{Types, is_declaration_file};
use crate::typescript::types::nodes::NodeTable;
use crate::typescript::types::tables::kind as k;

/// The answer for the program, kept for the run once it is known.
#[derive(Default)]
pub struct Publishers(Option<bool>);

const CODE: [&str; 8] = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const JAVASCRIPT: [&str; 4] = [".js", ".jsx", ".mjs", ".cjs"];

fn broker_names() -> Vec<&'static str> {
    MESSAGE_PACKAGES.iter().map(|(name, _)| *name).chain(BROKER_CLIENTS.iter().map(|(name, _, _)| *name)).collect()
}

fn is_relative(name: &str) -> bool {
    let rest = name.strip_prefix("..").or_else(|| name.strip_prefix('.'));
    name.starts_with('/') || rest.is_some_and(|rest| rest.is_empty() || rest.starts_with('/') || rest.starts_with('\\'))
}

fn literal(table: &NodeTable, index: Option<u32>, loose: bool) -> Option<String> {
    let index = index?;
    let kind = table.kind(index);
    if kind == k::STRING_LITERAL || (loose && kind == k::NO_SUBSTITUTION_TEMPLATE_LITERAL) {
        return table.text(index).map(|text| text.into_owned());
    }
    None
}

fn module_reference(table: &NodeTable, index: u32) -> Option<u32> {
    if table.kind(index) == k::IMPORT_EQUALS_DECLARATION {
        return table.child(index, "moduleReference").filter(|reference| table.kind(*reference) == k::EXTERNAL_MODULE_REFERENCE).and_then(|reference| table.child(reference, "expression"));
    }
    table.child(index, "moduleSpecifier")
}

fn is_module_file(table: &NodeTable) -> bool {
    table.listed(1, "statements").into_iter().any(|statement| {
        let kind = table.kind(statement);
        matches!(kind, k::IMPORT_DECLARATION | k::EXPORT_DECLARATION | k::EXPORT_ASSIGNMENT)
            || (kind == k::IMPORT_EQUALS_DECLARATION && module_reference(table, statement).is_some())
            || table.has_modifier(statement, k::EXPORT_KEYWORD)
    })
}

/// Whether the statement is one the compiler scans for module names: at the top of the file, or in the body of
/// an ambient `declare module "name"` of a file that is not a module (with a name that is not relative).
fn is_scanned(table: &NodeTable, index: u32, name: &str) -> bool {
    let Some(parent) = table.parent(index) else { return false };
    match table.kind(parent) {
        k::SOURCE_FILE => true,
        k::MODULE_BLOCK => {
            let declaration = table.parent(parent).filter(|declaration| table.kind(*declaration) == k::MODULE_DECLARATION);
            declaration.is_some_and(|declaration| {
                table.parent(declaration).is_some_and(|top| table.kind(top) == k::SOURCE_FILE)
                    && literal(table, table.child(declaration, "name"), false).is_some()
                    && table.has_modifier(declaration, k::DECLARE_KEYWORD)
                    && !is_module_file(table)
                    && !is_relative(name)
            })
        }
        _ => false,
    }
}

fn imported(table: &NodeTable, index: u32, javascript: bool) -> Option<String> {
    match table.kind(index) {
        k::IMPORT_DECLARATION | k::EXPORT_DECLARATION | k::IMPORT_EQUALS_DECLARATION => {
            let name = literal(table, module_reference(table, index), false).filter(|name| !name.is_empty())?;
            is_scanned(table, index, &name).then_some(name)
        }
        k::CALL_EXPRESSION => {
            let callee = table.child(index, "expression")?;
            let arguments = table.listed(index, "arguments");
            let first = arguments.first().copied();
            if table.kind(callee) == k::IMPORT_KEYWORD && first.is_some() {
                return literal(table, first, true);
            }
            let is_require = javascript && table.kind(callee) == k::IDENTIFIER && table.text(callee).as_deref() == Some("require") && arguments.len() == 1;
            if is_require { literal(table, first, true) } else { None }
        }
        k::IMPORT_TYPE => {
            let argument = table.child(index, "argument").filter(|argument| table.kind(*argument) == k::LITERAL_TYPE)?;
            literal(table, table.child(argument, "literal"), false)
        }
        _ => None,
    }
}

fn mentions_broker(table: &NodeTable, javascript: bool, names: &[&str]) -> bool {
    (1..table.count()).any(|index| imported(table, index, javascript).is_some_and(|name| names.contains(&name.as_str())))
}

fn program_mentions_broker(types: &mut Types) -> Option<bool> {
    let names = broker_names();
    let files = types.program_files();
    let (declarations, sources): (Vec<String>, Vec<String>) = files.into_iter().partition(|file| is_declaration_file(file));
    if declarations.iter().any(|file| package_from_path(file).is_some_and(|package| names.contains(&package.as_str()))) {
        return Some(true);
    }
    for file in sources.iter().filter(|file| CODE.iter().any(|extension| file.ends_with(extension))) {
        let Ok(text) = std::fs::read_to_string(file) else { continue };
        if !names.iter().any(|name| text.contains(name)) {
            continue;
        }
        let table = types.table_of(file)?;
        if mentions_broker(&table, JAVASCRIPT.iter().any(|extension| file.ends_with(extension)), &names) {
            return Some(true);
        }
    }
    Some(false)
}

/// `programMayPublish`; `None` when the compiler refused a question (nothing is kept then).
pub fn may_publish(types: &mut Types, known: &mut Publishers) -> Option<bool> {
    if known.0.is_none() {
        let found = program_mentions_broker(types);
        if types.refused.is_none() {
            known.0 = found;
        }
    }
    known.0
}
