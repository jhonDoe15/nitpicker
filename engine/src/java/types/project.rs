//! Builds the type index for one run: JDK and class path first, then every source class in passes.
use super::index::TypeIndex;
use super::model::ClassInfo;
use super::scope::{FileScope, Resolver, declared_name};
use crate::engine::source::{SourceFile, walk};
use rayon::prelude::*;
use std::path::PathBuf;
use tree_sitter::Node;

#[derive(Default)]
pub struct JavaProject {
    pub index: TypeIndex,
}

fn jdk_modules() -> Vec<PathBuf> {
    let home = std::env::var("NITPICKER_JDK")
        .or_else(|_| std::env::var("JAVA_HOME"))
        .unwrap_or_default();
    let mut modules: Vec<PathBuf> = std::fs::read_dir(PathBuf::from(home).join("jmods"))
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .map(|entry| entry.path())
                .collect()
        })
        .unwrap_or_default();
    modules.sort();
    modules
}

fn stub(name: String) -> ClassInfo {
    ClassInfo {
        name,
        ..ClassInfo::default()
    }
}

pub fn build(files: &[SourceFile], classpath: &[PathBuf]) -> JavaProject {
    let started = std::time::Instant::now();
    let mut index = TypeIndex::default();
    let mut entries = classpath.to_vec();
    entries.extend(jdk_modules());
    index.load_binaries(&entries);
    let binaries_ms = started.elapsed().as_secs_f64() * 1e3;
    let scopes: Vec<FileScope> = files.par_iter().map(FileScope::of).collect();
    let declared: Vec<Vec<(Node, String)>> = files
        .par_iter()
        .zip(&scopes)
        .map(|(file, scope)| {
            let mut found = Vec::new();
            walk(file.tree.root_node(), |node| {
                found.extend(declared_name(file, scope, node).map(|name| (node, name)));
            });
            found
        })
        .collect();
    for (_, name) in declared.iter().flatten() {
        index.put(stub(name.clone()));
        index.source_classes += 1;
    }
    let each = |index: &TypeIndex, with_members: bool| -> Vec<ClassInfo> {
        files
            .par_iter()
            .zip(&scopes)
            .zip(&declared)
            .flat_map_iter(|((file, scope), declarations)| {
                let resolver = Resolver::new(index, file, scope);
                declarations
                    .iter()
                    .map(|(node, name)| {
                        let mut info = resolver.class_header(*node, name.clone());
                        if with_members {
                            resolver.members(*node, &mut info);
                        }
                        info
                    })
                    .collect::<Vec<_>>()
            })
            .collect()
    };
    for with_members in [false, false, true] {
        for info in each(&index, with_members) {
            index.put(info);
        }
    }
    eprintln!(
        "type index: {} binary classes from {} entries in {binaries_ms:.0} ms, {} source classes in {:.0} ms",
        index.binary_classes,
        entries.len(),
        index.source_classes,
        started.elapsed().as_secs_f64() * 1e3 - binaries_ms
    );
    JavaProject { index }
}

const CLASS_BODIES: [&str; 4] = [
    "class_body",
    "interface_body",
    "enum_body",
    "annotation_type_body",
];

/// The file with the bodies of methods, constructors and initializers blanked, unless a class is declared inside.
/// Every byte keeps its place, so what is left sits at the same line and column.
pub fn outline(file: &SourceFile) -> String {
    let mut bytes = file.text.as_bytes().to_vec();
    let mut pending = vec![file.tree.root_node()];
    while let Some(node) = pending.pop() {
        let body = matches!(node.kind(), "block" | "constructor_body")
            && node.parent().is_some_and(|parent| {
                matches!(
                    parent.kind(),
                    "method_declaration"
                        | "constructor_declaration"
                        | "compact_constructor_declaration"
                        | "static_initializer"
                        | "class_body"
                )
            });
        if body && node.end_byte() - node.start_byte() >= 2 {
            let mut classes = false;
            walk(node, |inner| {
                classes |= CLASS_BODIES.contains(&inner.kind())
            });
            if !classes {
                for byte in &mut bytes[node.start_byte() + 1..node.end_byte() - 1] {
                    if *byte != b'\n' && *byte != b'\r' {
                        *byte = b' ';
                    }
                }
            }
            continue;
        }
        let mut cursor = node.walk();
        pending.extend(node.children(&mut cursor));
    }
    String::from_utf8(bytes).expect("blanking keeps the text valid")
}
