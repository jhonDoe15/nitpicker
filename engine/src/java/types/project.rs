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

fn jdk_home() -> PathBuf {
    PathBuf::from(std::env::var("NITPICKER_JDK").or_else(|_| std::env::var("JAVA_HOME")).unwrap_or_default())
}

fn jdk_modules() -> Vec<PathBuf> {
    let home = jdk_home();
    let mut modules: Vec<PathBuf> = std::fs::read_dir(home.join("jmods"))
        .map(|entries| entries.filter_map(Result::ok).map(|entry| entry.path()).collect())
        .unwrap_or_default();
    modules.sort();
    modules
}

fn stub(name: String) -> ClassInfo {
    ClassInfo { name, ..ClassInfo::default() }
}

pub fn build(files: &[SourceFile], classpath: &[PathBuf], release: Option<u32>) -> JavaProject {
    let started = std::time::Instant::now();
    let mut index = TypeIndex::default();
    let mut entries = classpath.to_vec();
    index.load_binaries(&entries);
    // An older release sees the library as it was then: the JDK keeps those signatures in `lib/ct.sym`.
    if !release.is_some_and(|release| index.load_release(&jdk_home().join("lib").join("ct.sym"), release)) {
        let modules = jdk_modules();
        index.load_binaries(&modules);
        entries.extend(modules);
    }
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
    for (file, scope) in files.iter().zip(&scopes) {
        let declaration = crate::engine::source::children(file.tree.root_node()).into_iter().find(|part| part.kind() == "package_declaration");
        if let Some(declaration) = declaration.filter(|_| file.path.ends_with("package-info.java")) {
            let flags = Resolver::new(&index, file, scope).marks(declaration);
            index.put(ClassInfo { flags, package: scope.package.clone(), ..stub(format!("{}.package-info", scope.package)) });
        }
    }
    let mut packages: Vec<&String> = scopes.iter().map(|scope| &scope.package).filter(|package| !package.is_empty()).collect();
    packages.sort();
    packages.dedup();
    index.checked_packages =
        packages.iter().filter(|name| !packages.iter().any(|other| name.starts_with(&format!("{other}.")))).map(|name| (*name).clone()).collect();
    eprintln!(
        "type index: {} binary classes from {} entries in {binaries_ms:.0} ms, {} source classes in {:.0} ms",
        index.binary_classes,
        entries.len(),
        index.source_classes,
        started.elapsed().as_secs_f64() * 1e3 - binaries_ms
    );
    JavaProject { index }
}

const CLASS_BODIES: [&str; 4] = ["class_body", "interface_body", "enum_body", "annotation_type_body"];

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
                    "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" | "static_initializer" | "class_body"
                )
            });
        if body && node.end_byte() - node.start_byte() >= 2 {
            let mut classes = false;
            walk(node, |inner| classes |= CLASS_BODIES.contains(&inner.kind()));
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
