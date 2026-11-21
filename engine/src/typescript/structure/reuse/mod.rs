//! Facts for the duplicate and reuse rules: what each file defines, imports and exports, and its functions as
//! units for the near-duplicate rules.
pub mod definitions;
pub mod modules;
pub mod parts;
pub mod references;
pub mod trees;
pub mod units;
pub mod untyped;

use crate::typescript::{ParsedFile, with_tokens};
use crate::typescript::tokens::TokenTexts;
use crate::typescript::tree::Tree;
use rayon::prelude::*;
use serde::Serialize;

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct FileFacts {
    pub path: String,
    /// Set when the engine cannot read the file the way the compiler does; the other facts are then empty.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unparsed: Option<String>,
    pub definitions: Vec<definitions::Definition>,
    pub imports: Vec<modules::Import>,
    pub dynamic_imports: Vec<String>,
    pub exports: modules::Exports,
    pub jsx_tags: Vec<String>,
    pub near_duplicate_units: Vec<units::Unit>,
}

/// `file` must have been parsed with its tokens kept.
pub fn file_facts(file: &ParsedFile, display: &str) -> FileFacts {
    if file.panicked {
        return FileFacts { path: display.to_string(), unparsed: Some(file.errors.join("; ")), ..FileFacts::default() };
    }
    let tree = Tree::of(file.program);
    let texts = TokenTexts::of(file, &tree);
    let names = references::Names::of(&tree);
    let type_only = untyped::TypeOnly::of(file, &tree);
    let reader = definitions::Reader { file, texts: &texts, names: &names, type_only: &type_only };
    let imports = modules::imports(file);
    let mut imported = std::collections::HashMap::new();
    for import in &imports {
        let entries = import
            .default_name
            .iter()
            .map(|local| (local, "default"))
            .chain(import.namespace_name.iter().map(|local| (local, "*")))
            .chain(import.named.iter().map(|named| (&named.local, named.imported.as_str())));
        for (local, name) in entries {
            imported.insert(local.clone(), format!("{}#{name}", import.specifier));
        }
    }
    FileFacts {
        path: display.to_string(),
        unparsed: None,
        definitions: reader.definitions(),
        near_duplicate_units: units::units(file, &tree, display, &imported),
        imports,
        dynamic_imports: modules::dynamic_imports(file.halves, &tree),
        exports: modules::exports(file),
        jsx_tags: modules::jsx_tags(file, &tree),
    }
}

/// Writes one JSON line per file, in the order listed. `files` pairs the path to read with the path to report.
/// Files are read in batches so the text of all facts is never held at once.
pub fn write_facts(files: &[(String, String)], out: &mut dyn std::io::Write) -> std::io::Result<()> {
    let pool = rayon::ThreadPoolBuilder::new().stack_size(64 << 20).build().expect("threads");
    for batch in files.chunks(256) {
        let lines: Vec<String> = pool.install(|| {
            batch
                .par_iter()
                .map(|(path, display)| {
                    let bytes = match std::fs::read(path) {
                        Ok(bytes) => bytes,
                        Err(error) => {
                            let unread = FileFacts { path: display.clone(), unparsed: Some(error.to_string()), ..FileFacts::default() };
                            return serde_json::to_string(&unread).expect("json");
                        }
                    };
                    let text = String::from_utf8_lossy(&bytes);
                    let text = text.strip_prefix('\u{feff}').unwrap_or(&text);
                    with_tokens(path, text, |file| file.halves.json(serde_json::to_string(&file_facts(file, display)).expect("json")))
                })
                .collect()
        });
        for line in lines {
            out.write_all(line.as_bytes())?;
            out.write_all(b"\n")?;
        }
    }
    out.flush()
}
