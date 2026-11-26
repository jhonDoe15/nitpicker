//! A `tsconfig.json` the resolver cannot load because a config it extends is not there (a package that is not
//! installed), read as the compiler reads it: the file's own options and those of the parents that are there count,
//! a missing parent adds nothing.
use oxc_resolver::{ResolveOptions, Resolver, TsConfig};
use serde_json::{Map, Value, json};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, OnceLock};

/// How deep a chain of configs that cannot be loaded as they are is followed.
const MAX_DEPTH: usize = 8;

/// A parent config as the copy names it: the path to load it from, and whether it sets `baseUrl`.
type Parent = (PathBuf, bool);

fn normalized(path: &Path) -> PathBuf {
    let mut kept = PathBuf::new();
    for part in path.components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                kept.pop();
            }
            other => kept.push(other),
        }
    }
    kept
}

fn text_of(path: PathBuf) -> Value {
    Value::String(path.to_string_lossy().into_owned())
}

/// How the compiler finds a config named like a package in `extends`: its `exports`, else the `tsconfig` field of
/// its `package.json`, else its `tsconfig.json`.
fn package_configs() -> &'static Resolver {
    static PACKAGES: OnceLock<Resolver> = OnceLock::new();
    PACKAGES.get_or_init(|| {
        Resolver::new(ResolveOptions {
            condition_names: vec!["node".into(), "import".into()],
            extensions: vec![".json".into()],
            main_fields: vec!["tsconfig".into()],
            main_files: vec!["tsconfig".into()],
            ..ResolveOptions::default()
        })
    })
}

/// The file a parent named in `extends` stands for, when it is there.
fn parent_file(parent: &str, directory: &Path) -> Option<PathBuf> {
    if parent.starts_with('.') || Path::new(parent).is_absolute() {
        let target = normalized(&directory.join(parent));
        let target = if target.is_file() || parent.ends_with(".json") { target } else { PathBuf::from(format!("{}.json", target.display())) };
        return target.is_file().then_some(target);
    }
    package_configs().resolve(directory, parent).ok().map(|found| found.into_path_buf()).filter(|found| found.is_file())
}

/// The parents that can be loaded, in their order, each as the path to load it from and whether it sets `baseUrl`;
/// a parent that is not there adds nothing, as for the compiler.
fn present_parents(resolver: &Resolver, config: &Value, directory: &Path, depth: usize) -> Vec<Parent> {
    let listed = match config.get("extends") {
        Some(Value::String(one)) => vec![one.clone()],
        Some(Value::Array(many)) => many.iter().filter_map(|one| one.as_str().map(String::from)).collect(),
        _ => Vec::new(),
    };
    listed
        .iter()
        .filter_map(|parent| parent_file(parent, directory))
        .filter_map(|parent| loaded(resolver, &parent, depth + 1))
        .map(|(file, parent)| (file, parent.compiler_options.base_url.is_some()))
        .collect()
}

/// The file's own options with its paths made absolute. Without a `baseUrl` of its own, `paths` resolve against the
/// `baseUrl` a parent sets when one does, and else against the file's own directory.
fn own_options(config: &Value, directory: &Path, inherited_base: bool) -> Value {
    let mut options: Map<String, Value> = config.get("compilerOptions").and_then(Value::as_object).cloned().unwrap_or_default();
    let base = options.get("baseUrl").and_then(Value::as_str).map(|base| normalized(&directory.join(base)));
    let paths_base = match (&base, inherited_base) {
        (Some(base), _) => Some(base.clone()),
        (None, true) => None,
        (None, false) => Some(directory.to_path_buf()),
    };
    if let Some(base) = base {
        options.insert("baseUrl".into(), text_of(base));
    }
    if let (Some(Value::Object(paths)), Some(paths_base)) = (options.get_mut("paths"), paths_base) {
        for targets in paths.values_mut().filter_map(Value::as_array_mut) {
            for target in targets.iter_mut() {
                if let Some(written) = target.as_str() {
                    *target = text_of(normalized(&paths_base.join(written)));
                }
            }
        }
    }
    Value::Object(options)
}

fn synthetic(config: &Value, directory: &Path, parents: &[Parent]) -> Value {
    let references: Vec<Value> = config
        .get("references")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|reference| reference.get("path").and_then(Value::as_str))
        .map(|path| json!({ "path": text_of(normalized(&directory.join(path))) }))
        .collect();
    let inherited_base = parents.iter().any(|(_, base)| *base);
    let options = own_options(config, directory, inherited_base);
    let mut found = json!({ "compilerOptions": options, "references": references });
    if !parents.is_empty() {
        found["extends"] = Value::Array(parents.iter().map(|(file, _)| text_of(file.clone())).collect());
    }
    found
}

/// A copy named after both the original and what it holds, so that no two different copies share a file.
fn written(file: &Path, content: &Value) -> Option<PathBuf> {
    let text = serde_json::to_string(content).ok()?;
    let mut hasher = DefaultHasher::new();
    file.hash(&mut hasher);
    text.hash(&mut hasher);
    let name = hasher.finish();
    let directory = std::env::temp_dir().join("nitpicker-engine-tsconfig");
    std::fs::create_dir_all(&directory).ok()?;
    let target = directory.join(format!("{name:x}.json"));
    let pending = directory.join(format!("{name:x}.{}.{:?}.tmp", std::process::id(), std::thread::current().id()));
    std::fs::write(&pending, text).ok()?;
    std::fs::rename(&pending, &target).ok()?;
    Some(target)
}

fn loaded(resolver: &Resolver, file: &Path, depth: usize) -> Option<(PathBuf, Arc<TsConfig>)> {
    if let Ok(config) = resolver.resolve_tsconfig(file) {
        return Some((file.to_path_buf(), config));
    }
    if depth > MAX_DEPTH {
        return None;
    }
    let mut text = std::fs::read_to_string(file).ok()?;
    json_strip_comments::strip(&mut text).ok()?;
    let config: Value = serde_json::from_str(&text).ok()?;
    let directory = file.parent()?;
    let parents = present_parents(resolver, &config, directory, depth);
    [parents, Vec::new()].into_iter().find_map(|parents| {
        let copy = written(file, &synthetic(&config, directory, &parents))?;
        resolver.resolve_tsconfig(&copy).ok().map(|loaded| (copy, loaded))
    })
}

/// The config at `file` and the path to load it from: the file itself, or a copy that leaves out what is missing.
pub fn load(resolver: &Resolver, file: &Path) -> Option<(PathBuf, Arc<TsConfig>)> {
    loaded(resolver, file, 0)
}
