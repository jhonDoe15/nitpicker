//! The exported constants, the exported names and the re-exports of one module, read once per run.
use crate::typescript::{EXTENSIONS, with_parsed};
use super::extract::read;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

pub const DEFAULT_EXPORT: &str = "default";
pub const MAX_REEXPORT_DEPTH: usize = 4;

/// The value of a constant: the text or the number a test could copy.
#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Text(String),
    Number(f64),
}

/// `valueKey`: two values are the same when their keys are.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum Key {
    Text(String),
    Number(u64),
}

impl Value {
    pub fn key(&self) -> Key {
        match self {
            Value::Text(text) => Key::Text(text.clone()),
            Value::Number(number) => Key::Number(if *number == 0.0 { 0 } else { number.to_bits() }),
        }
    }
}

/// `export { local as exported } from specifier`, or `export * from specifier` when `names` is `None`.
pub struct Reexport {
    pub specifier: String,
    pub names: Option<Vec<(String, String)>>,
    pub(super) target: OnceLock<Option<PathBuf>>,
}

impl Reexport {
    pub fn target(&self, containing: &Path) -> Option<PathBuf> {
        let modules = crate::typescript::resolve::Modules::shared();
        self.target.get_or_init(|| modules.project_file(&self.specifier, containing)).clone()
    }
}

#[derive(Default)]
pub struct Module {
    pub constants: Vec<(String, Value)>,
    pub reexports: Vec<Reexport>,
    pub defined: HashSet<String>,
    /// The parser reported errors: the compiler may read this file another way.
    pub unparsed: bool,
}

pub fn is_constant_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    if bytes.len() < 2 || !bytes[0].is_ascii_uppercase() {
        return false;
    }
    let mut after_gap = false;
    for (index, byte) in bytes.iter().enumerate() {
        match byte {
            b'A'..=b'Z' | b'0'..=b'9' => after_gap = false,
            b'_' if index > 0 && !after_gap => after_gap = true,
            _ => return false,
        }
    }
    !after_gap
}

pub fn is_constant_path(name: &str) -> bool {
    is_constant_name(name.rsplit('.').next().unwrap_or(""))
}

/// `renamedHead`: the name with its first dotted part renamed, or `None` when the rename drops it.
pub fn renamed_head(name: &str, rename: impl Fn(&str) -> Option<String>) -> Option<String> {
    let (head, rest) = match name.split_once('.') {
        Some((head, rest)) => (head, Some(rest)),
        None => (name, None),
    };
    let renamed = rename(head)?;
    Some(match rest {
        Some(rest) => format!("{renamed}.{rest}"),
        None => renamed,
    })
}

fn is_javascript(file: &str) -> bool {
    let name = file.rsplit('/').next().unwrap_or(file);
    let Some((_, extension)) = name.rsplit_once('.') else { return false };
    let extension = extension.strip_prefix(['c', 'm']).unwrap_or(extension);
    matches!(extension, "js" | "jsx")
}

fn load(file: &Path) -> Module {
    let path = file.to_string_lossy();
    let extension = file.extension().and_then(|extension| extension.to_str());
    let known = extension.is_some_and(|extension| EXTENSIONS.contains(&extension));
    let Some(text) = known.then(|| std::fs::read_to_string(file).ok()).flatten() else { return Module::default() };
    with_parsed(&path, &text, |parsed| {
        if parsed.panicked || !parsed.errors.is_empty() {
            return Module { unparsed: true, ..Module::default() };
        }
        read(parsed.program, is_javascript(&path))
    })
}

fn weight(module: &Module) -> usize {
    let text_length = |value: &Value| if let Value::Text(text) = value { text.len() } else { 0 };
    let names = module.constants.iter().map(|(name, value)| name.len() + 48 + text_length(value));
    let reexports = module.reexports.iter().map(|reexport| reexport.specifier.len() + 96);
    names.chain(reexports).sum::<usize>() + module.defined.iter().map(|name| name.len() + 48).sum::<usize>() + 128
}

/// Modules kept, in bytes of what they hold, before the cache starts over.
const BUDGET: usize = 192 * 1024 * 1024;

#[derive(Default)]
struct Cache {
    slots: HashMap<PathBuf, Arc<OnceLock<Arc<Module>>>>,
    bytes: usize,
}

/// `parsedModule`: each file is parsed once, by whichever thread asks first.
pub fn module_of(file: &Path) -> Arc<Module> {
    static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
    let cache = CACHE.get_or_init(Mutex::default);
    let slot = {
        let mut held = cache.lock().expect("lock");
        if held.bytes > BUDGET {
            *held = Cache::default();
        }
        held.slots.entry(file.to_path_buf()).or_default().clone()
    };
    let mut fresh = 0;
    let module = slot
        .get_or_init(|| {
            let module = load(file);
            fresh = weight(&module) + file.as_os_str().len();
            Arc::new(module)
        })
        .clone();
    if fresh > 0 {
        cache.lock().expect("lock").bytes += fresh;
    }
    module
}

/// The modules the target reaches through re-exports, as far as the walks go, whatever the layout says.
pub fn closure(target: &Path) -> Vec<(PathBuf, Arc<Module>)> {
    let mut found: Vec<(PathBuf, Arc<Module>)> = Vec::new();
    let mut seen = HashSet::from([target.to_path_buf()]);
    let mut pending = vec![(target.to_path_buf(), 0usize)];
    let mut index = 0;
    while index < pending.len() {
        let (file, depth) = pending[index].clone();
        index += 1;
        let module = module_of(&file);
        if depth < MAX_REEXPORT_DEPTH {
            for next in module.reexports.iter().filter_map(|reexport| reexport.target(&file)) {
                if seen.insert(next.clone()) {
                    pending.push((next, depth + 1));
                }
            }
        }
        found.push((file, module));
    }
    found
}

/// Every value some module the target reaches exports.
pub fn reachable_keys(target: &Path) -> HashSet<Key> {
    closure(target).iter().flat_map(|(_, module)| module.constants.iter().map(|(_, value)| value.key())).collect()
}

/// The modules whose layout answer can change what the loads give for `key`: those that hold it, those a walk
/// passes through to reach them, and those that hold a constant of the same name, which would come first.
pub fn relevant_files(targets: &[&Path], key: &Key) -> HashSet<PathBuf> {
    let mut relevant = HashSet::new();
    for target in targets {
        let files = closure(target);
        let holds = |module: &Module| module.constants.iter().any(|(_, value)| value.key() == *key);
        let holders = files.iter().filter(|(_, module)| module.unparsed || holds(module)).map(|(file, _)| file);
        let held: HashSet<&str> = files
            .iter()
            .flat_map(|(_, module)| module.constants.iter().filter(|(_, value)| value.key() == *key))
            .map(|(name, _)| name.as_str())
            .collect();
        let aliased = |reexport: &Reexport| {
            reexport.names.as_ref().is_some_and(|names| names.iter().any(|(exported, local)| exported != local))
        };
        let renamed = files.iter().any(|(_, module)| module.reexports.iter().any(aliased));
        let mut marked: HashSet<PathBuf> = holders.cloned().collect();
        for (file, module) in &files {
            let same = module.constants.iter().any(|(name, _)| renamed || held.contains(name.as_str()));
            if same {
                marked.insert(file.clone());
            }
        }
        loop {
            let before = marked.len();
            for (file, module) in &files {
                let targets = module.reexports.iter().filter_map(|reexport| reexport.target(file));
                if targets.into_iter().any(|target| marked.contains(&target)) {
                    marked.insert(file.clone());
                }
            }
            if marked.len() == before {
                break;
            }
        }
        relevant.extend(marked);
    }
    relevant
}
