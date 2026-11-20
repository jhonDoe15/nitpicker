//! Facts for the duplicate and reuse rules: what each file defines, imports and exports.
pub mod definitions;
pub mod modules;
pub mod parts;
pub mod references;
pub mod untyped;

use crate::typescript::{ParsedFile, with_tokens};
use crate::typescript::tokens::TokenTexts;
use crate::typescript::tree::Tree;
use rayon::prelude::*;
use serde::Serialize;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileFacts {
    pub path: String,
    pub definitions: Vec<definitions::Definition>,
    pub imports: Vec<modules::Import>,
    pub dynamic_imports: Vec<String>,
    pub exports: modules::Exports,
    pub jsx_tags: Vec<String>,
}

/// `file` must have been parsed with its tokens kept.
pub fn file_facts(file: &ParsedFile, display: &str) -> FileFacts {
    let tree = Tree::of(file.program);
    let texts = TokenTexts::of(file, &tree);
    let names = references::Names::of(&tree);
    let type_only = untyped::TypeOnly::of(file, &tree);
    let reader = definitions::Reader { file, texts: &texts, names: &names, type_only: &type_only };
    FileFacts {
        path: display.to_string(),
        definitions: reader.definitions(),
        imports: modules::imports(file),
        dynamic_imports: modules::dynamic_imports(&tree),
        exports: modules::exports(file),
        jsx_tags: modules::jsx_tags(file, &tree),
    }
}

/// One JSON line per file, in the order listed. `files` pairs the path to read with the path to report.
pub fn facts_lines(files: &[(String, String)]) -> String {
    let lines: Vec<String> = files
        .par_iter()
        .map(|(path, display)| {
            let text = std::fs::read_to_string(path).unwrap_or_default();
            let text = text.strip_prefix('\u{feff}').unwrap_or(&text);
            with_tokens(path, text, |file| serde_json::to_string(&file_facts(file, display)).expect("json"))
        })
        .collect();
    lines.into_iter().flat_map(|line| [line, "\n".to_string()]).collect()
}
