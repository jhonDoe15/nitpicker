//! Builds the type index for one run: JDK and class path first, then every source class in passes.
use super::index::TypeIndex;
use super::model::ClassInfo;
use super::scope::{FileScope, Resolver, declared_name};
use crate::engine::source::{SourceFile, walk};
use rayon::prelude::*;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use tree_sitter::Node;

#[derive(Default)]
pub struct JavaProject {
    pub index: TypeIndex,
    /// The source file that declares each class of the run.
    pub sources: std::collections::HashMap<String, String>,
    /// Classes whose `Class` object the code names: a class literal, or an `assert`, which reads the top class's.
    pub literals: HashSet<String>,
    /// The project's `volatile` fields, as the class that declares them and their name.
    pub volatiles: HashSet<(String, String)>,
    /// The project's final fields initialized to `null`.
    pub null_finals: HashSet<(String, String)>,
    /// Integer constants the project declares, by field name; `None` when two declarations disagree.
    pub numbers: HashMap<String, Option<i64>>,
    /// The classes some class of the sources extends.
    pub extended: HashSet<String>,
    /// With Lombok: the class files of the source classes, by binary name (see `compiled`).
    pub compiled: HashMap<String, super::compiled::CompiledClass>,
    /// With Lombok: the index name of each source class that has a class file, by binary name.
    pub binaries: HashMap<String, String>,
}

fn jdk_home() -> PathBuf {
    PathBuf::from(std::env::var("NITPICKER_JDK").or_else(|_| std::env::var("JAVA_HOME")).unwrap_or_default())
}

/// The major version of the JDK, from its `release` file; zero when it is unknown.
pub fn jdk_major() -> u32 {
    static MAJOR: std::sync::OnceLock<u32> = std::sync::OnceLock::new();
    *MAJOR.get_or_init(read_jdk_major)
}

fn read_jdk_major() -> u32 {
    let text = std::fs::read_to_string(jdk_home().join("release")).unwrap_or_default();
    let version = text.lines().find_map(|line| line.strip_prefix("JAVA_VERSION=")).unwrap_or_default().trim_matches('"');
    let first = version.split(['.', '-', '+']).next().unwrap_or_default();
    let major = if first == "1" { version.split('.').nth(1).unwrap_or_default() } else { first };
    major.parse().unwrap_or(0)
}

fn jdk_modules() -> Vec<PathBuf> {
    let home = jdk_home();
    let mut modules: Vec<PathBuf> = std::fs::read_dir(home.join("jmods"))
        .map(|entries| entries.filter_map(Result::ok).map(|entry| entry.path()).collect())
        .unwrap_or_default();
    modules.sort();
    if modules.is_empty() {
        eprintln!("nitpicker-engine: no jmods folder under NITPICKER_JDK or JAVA_HOME; JDK types are unknown");
    }
    modules
}

/// Reads the class files of the source classes and gives their fields the access bits javac wrote: Lombok's
/// `@Value`, `@FieldDefaults` and `@UtilityClass` change them.
fn compiled_members(
    index: &mut TypeIndex,
    sources: &HashMap<String, String>,
    classes: &[PathBuf],
) -> (HashMap<String, super::compiled::CompiledClass>, HashMap<String, String>) {
    use super::compiled::{ACC_FINAL, ACC_PRIVATE, ACC_PROTECTED, ACC_PUBLIC, ACC_STATIC};
    use super::model::flag;
    let compiled = super::compiled::read(classes);
    let mut binaries = HashMap::new();
    for name in sources.keys() {
        let binary = crate::java::javac::binary(index, name);
        let (Some(class), Some(info)) = (compiled.get(&binary), index.get(name)) else { continue };
        let mut info = info.clone();
        for field in &mut info.fields {
            let Some(written) = class.field(&field.name) else { continue };
            let bits = [(ACC_FINAL, flag::FINAL), (ACC_PUBLIC, flag::PUBLIC), (ACC_PROTECTED, flag::PROTECTED), (ACC_STATIC, flag::STATIC)];
            field.flags &= !(flag::FINAL | flag::PUBLIC | flag::PROTECTED | flag::STATIC);
            field.flags |= bits.iter().filter(|(access, _)| written.access & access != 0).map(|(_, bit)| bit).sum::<u32>();
            field.is_private = written.access & ACC_PRIVATE != 0;
        }
        index.put(info);
        binaries.insert(binary, name.clone());
    }
    (compiled, binaries)
}

fn stub(name: String) -> ClassInfo {
    ClassInfo { name, ..ClassInfo::default() }
}

/// The modules of a module path: a folder without `module-info.class` holds modules, as javac reads it, each a jar
/// or a folder of its own.
fn module_entries(path: &[PathBuf]) -> Vec<PathBuf> {
    path.iter()
        .flat_map(|entry| {
            if !entry.is_dir() || entry.join("module-info.class").exists() {
                return vec![entry.clone()];
            }
            let mut held: Vec<PathBuf> = std::fs::read_dir(entry)
                .map(|listed| listed.flatten().map(|child| child.path()).filter(|child| child.is_dir() || child.extension().is_some_and(|extension| extension == "jar")).collect())
                .unwrap_or_default();
            held.sort();
            held
        })
        .collect()
}

pub fn build(files: &[SourceFile], options: &crate::engine::Options) -> JavaProject {
    let (classpath, release) = (&options.classpath, options.release);
    let started = std::time::Instant::now();
    let mut index = TypeIndex::default();
    index.lombok = options.lombok;
    index.android_compatible = options.android_compatible;
    index.test_only = options.test_only;
    index.source_level = release.or(options.source).unwrap_or_else(jdk_major);
    let modules = module_entries(&options.module_path);
    let mut entries = [modules.as_slice(), classpath].concat();
    index.load_binaries(&entries);
    index.load_modules(&modules);
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
    let mut sources = std::collections::HashMap::new();
    for (file, found) in files.iter().zip(&declared) {
        for (_, name) in found {
            index.put(stub(name.clone()));
            index.source_classes += 1;
            sources.insert(name.clone(), file.path.clone());
        }
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
                            resolver.lombok_members(*node, &mut info);
                            resolver.slf4j_field(*node, &mut info);
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
    // A constant read from another constant is known once that one is: each round settles one more step.
    for _ in 0..8 {
        let later: Vec<(String, Vec<(String, String)>)> = files
            .par_iter()
            .zip(&scopes)
            .zip(&declared)
            .flat_map_iter(|((file, scope), declarations)| {
                let resolver = Resolver::new(&index, file, scope);
                declarations
                    .iter()
                    .filter_map(|(node, name)| Some((name.clone(), resolver.later_constants(*node, index.get(name)?))))
                    .filter(|(_, found)| !found.is_empty())
                    .collect::<Vec<_>>()
            })
            .collect();
        if later.is_empty() {
            break;
        }
        for (name, found) in later {
            let Some(mut info) = index.get(&name).cloned() else { continue };
            for (field, value) in found {
                info.fields.iter_mut().filter(|known| known.name == field).for_each(|known| known.constant = Some(value.clone()));
            }
            index.put(info);
        }
    }
    let (compiled, binaries) = if options.lombok && !options.classes.is_empty() { compiled_members(&mut index, &sources, &options.classes) } else { Default::default() };
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
    index.settle();
    let literals = class_literals(files, &scopes, &index);
    let volatiles = fields_where(files, &scopes, |_, field, _| field.kind() == "field_declaration" && crate::java::helpers::has_modifier(field, "volatile"));
    let null_finals = fields_where(files, &scopes, |_, field, declarator| {
        let fixed = field.kind() == "constant_declaration" || crate::java::helpers::has_modifier(field, "final");
        fixed && declarator.child_by_field_name("value").is_some_and(|value| value.kind() == "null_literal")
    });
    let numbers = integer_constants(files);
    let extended = declared.iter().flatten().filter_map(|(_, name)| index.get(name)?.superclass.clone()).collect();
    JavaProject { index, sources, literals, volatiles, null_finals, numbers, extended, compiled, binaries }
}

/// Puts back, as statements of the blanked body, the class literals, `forName` calls and `assert` statements that
/// `literals` reads.
fn keep_class_objects(file: &SourceFile, body: Node, bytes: &mut [u8]) {
    let mut kept: Vec<(usize, usize, bool)> = Vec::new();
    walk(body, |node| {
        let inside = kept.last().is_some_and(|(_, end, _)| node.start_byte() < *end);
        match node.kind() {
            "assert_statement" if !inside => kept.push((node.start_byte(), node.end_byte(), false)),
            "class_literal" | "method_invocation" if !inside && loads_class(file, node) => kept.push((node.start_byte(), node.end_byte(), true)),
            _ => {}
        }
    });
    for (start, end, _) in &kept {
        bytes[*start..*end].copy_from_slice(&file.text.as_bytes()[*start..*end]);
    }
    for (start, end, _) in kept.into_iter().filter(|(_, _, literal)| *literal) {
        let after = bytes[end..body.end_byte()].iter().position(|byte| !matches!(byte, b'\n' | b'\r')).map(|at| end + at);
        match after.filter(|at| bytes[*at] == b' ') {
            Some(at) => bytes[at] = b';',
            None => bytes[start..end].iter_mut().filter(|byte| !matches!(byte, b'\n' | b'\r')).for_each(|byte| *byte = b' '),
        }
    }
}

type FieldTest = fn(&SourceFile, Node, Node) -> bool;

fn fields_where(files: &[SourceFile], scopes: &[FileScope], test: FieldTest) -> HashSet<(String, String)> {
    files
        .par_iter()
        .zip(scopes)
        .flat_map_iter(|(file, scope)| {
            let mut found = Vec::new();
            walk(file.tree.root_node(), |node| {
                if !matches!(node.kind(), "field_declaration" | "constant_declaration") {
                    return;
                }
                let Some(class) = super::scope::enclosing_types(scope, node).into_iter().next() else { return };
                let mut cursor = node.walk();
                for declarator in node.children_by_field_name("declarator", &mut cursor).filter(|declarator| test(file, node, *declarator)) {
                    found.extend(declarator.child_by_field_name("name").map(|name| (class.clone(), file.text_of(name).to_string())));
                }
            });
            found
        })
        .collect()
}

/// The value of an integer or character literal, with an optional minus sign.
pub fn integer_value(file: &SourceFile, node: Node) -> Option<i64> {
    let text = file.text_of(node).replace('_', "");
    match node.kind() {
        "parenthesized_expression" => integer_value(file, node.named_child(0)?),
        "unary_expression" if text.starts_with('-') => integer_value(file, node.child_by_field_name("operand")?).map(|value| -value),
        "decimal_integer_literal" => text.trim_end_matches(['l', 'L']).parse().ok(),
        "hex_integer_literal" => i64::from_str_radix(text.trim_end_matches(['l', 'L']).get(2..)?, 16).ok(),
        "character_literal" => {
            let inner = text.get(1..text.len() - 1)?;
            let mut chars = inner.chars();
            match (chars.next()?, chars.next()) {
                ('\\', Some(escaped)) if inner.len() == 2 => "btnfr\"'\\".find(escaped).map(|at| [8, 9, 10, 12, 13, 34, 39, 92][at]),
                (single, None) => Some(i64::from(u32::from(single))),
                _ => None,
            }
        }
        _ => None,
    }
}

fn integer_constants(files: &[SourceFile]) -> HashMap<String, Option<i64>> {
    let found: Vec<(String, i64)> = files
        .par_iter()
        .flat_map_iter(|file| {
            let mut found = Vec::new();
            walk(file.tree.root_node(), |node| {
                let constant = node.kind() == "constant_declaration"
                    || (node.kind() == "field_declaration" && ["static", "final"].iter().all(|word| crate::java::helpers::has_modifier(node, word)));
                if !constant {
                    return;
                }
                let mut cursor = node.walk();
                for declarator in node.children_by_field_name("declarator", &mut cursor) {
                    let value = declarator.child_by_field_name("value").and_then(|value| integer_value(file, value));
                    if let (Some(name), Some(value)) = (declarator.child_by_field_name("name"), value) {
                        found.push((file.text_of(name).to_string(), value));
                    }
                }
            });
            found
        })
        .collect();
    let mut numbers: HashMap<String, Option<i64>> = HashMap::new();
    for (name, value) in found {
        let entry = numbers.entry(name).or_insert(Some(value));
        if *entry != Some(value) {
            *entry = None;
        }
    }
    numbers
}

fn class_literals(files: &[SourceFile], scopes: &[FileScope], index: &TypeIndex) -> HashSet<String> {
    files
        .par_iter()
        .zip(scopes)
        .flat_map_iter(|(file, scope)| {
            let resolver = Resolver::new(index, file, scope);
            let mut found = Vec::new();
            walk(file.tree.root_node(), |node| match node.kind() {
                "class_literal" => {
                    let named = node.named_child(0).and_then(|written| resolver.type_node(written));
                    found.extend(named.and_then(|kind| match kind {
                        super::model::Type::Class(name, _) => Some(name),
                        _ => None,
                    }));
                }
                "assert_statement" => found.extend(super::scope::enclosing_types(scope, node).pop()),
                "method_invocation" => found.extend(loaded_by_name(&resolver, index, node)),
                _ => {}
            });
            found
        })
        .collect()
}

fn loads_class(file: &SourceFile, node: Node) -> bool {
    let name = node.child_by_field_name("name").map(|name| file.text_of(name));
    node.kind() == "class_literal" || (name == Some("forName") && node.child_by_field_name("object").is_some())
}

/// The class `Class.forName` loads when its one argument is a constant: javac writes the name into the class file.
fn loaded_by_name(resolver: &Resolver, index: &TypeIndex, call: Node) -> Option<String> {
    let arguments = call.child_by_field_name("arguments")?;
    if resolver.file.text_of(call.child_by_field_name("name")?) != "forName" || arguments.named_child_count() != 1 {
        return None;
    }
    let on_class = matches!(resolver.receiver(call.child_by_field_name("object")?)?, super::expr::Receiver::Static(owner) if owner == "java.lang.Class");
    let binary = resolver.constant_string(arguments.named_child(0)?).filter(|_| on_class)?;
    let dotted = binary.replace('$', ".");
    Some(if index.get(&dotted).is_some() { dotted } else { binary })
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
                keep_class_objects(file, node, &mut bytes);
            }
            continue;
        }
        let mut cursor = node.walk();
        pending.extend(node.children(&mut cursor));
    }
    String::from_utf8(bytes).expect("blanking keeps the text valid")
}
