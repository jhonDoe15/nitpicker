//! `definingModules` and `exportedConstants`: which modules define the names a test imports and which constants
//! they export through re-exports. Whether a module is production code is a question of the project layout, which
//! the caller answers: the walk is run once for each way those answers can go, and says which ones it asked.
use super::module::{
    DEFAULT_EXPORT, Key, MAX_REEXPORT_DEPTH, Module, Value, is_constant_path, module_of, relevant_files, renamed_head,
};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::sync::Arc;

const MAX_LEAVES: usize = 64;

/// What the test file loads: a specifier as written, the names it binds and the file it resolves to.
pub struct Load {
    pub specifier: String,
    pub names: Vec<(String, Vec<String>)>,
    pub whole: bool,
    pub target: PathBuf,
}

impl Load {
    fn bound(&self, name: &str) -> &[String] {
        self.names.iter().find(|(imported, _)| imported == name).map_or(&[], |(_, local)| local.as_slice())
    }
}

/// A constant seen from the test: the name, the specifier it comes from and the names that mention it.
pub struct Entry {
    pub name: String,
    pub owner: String,
    pub mentions: Vec<String>,
}

enum Rename {
    Identity,
    Through(Vec<(String, String)>, Rc<Rename>),
}

impl Rename {
    fn apply(&self, name: &str) -> Option<String> {
        match self {
            Rename::Identity => Some(name.to_string()),
            Rename::Through(names, outer) => {
                let listed = names.iter().find(|(_, local)| local == name)?;
                outer.apply(&listed.0)
            }
        }
    }
}

struct Step {
    file: PathBuf,
    depth: usize,
    rename: Rc<Rename>,
}

fn is_declaration(file: &Path) -> bool {
    let name = file.to_string_lossy();
    [".d.ts", ".d.mts", ".d.cts"].iter().any(|ending| name.ends_with(ending))
}

/// `path.relative(root, file)` with `/` between its parts, when it stays inside the root.
fn relative(root: &Path, file: &Path) -> Option<String> {
    let inside = file.strip_prefix(root).ok()?.to_string_lossy().replace('\\', "/");
    (!inside.starts_with("..")).then_some(inside)
}

/// One run of the walks, with the layout answers given for the files it asks about.
pub struct Eval<'r> {
    root: &'r Path,
    prefix: &'r [bool],
    answers: HashMap<PathBuf, bool>,
    relevant: &'r HashSet<PathBuf>,
    pub asked: Vec<(String, bool)>,
    pub unparsed: bool,
}

impl<'r> Eval<'r> {
    pub fn new(root: &'r Path, prefix: &'r [bool], relevant: &'r HashSet<PathBuf>) -> Eval<'r> {
        Eval { root, prefix, answers: HashMap::new(), relevant, asked: Vec::new(), unparsed: false }
    }

    fn module(&mut self, file: &Path) -> Arc<Module> {
        let module = module_of(file);
        self.unparsed |= module.unparsed;
        module
    }

    /// `isProductionModule`. A file whose answer cannot change what the test sees is production without asking.
    fn is_production(&mut self, file: &Path) -> bool {
        if is_declaration(file) {
            return false;
        }
        let Some(inside) = relative(self.root, file) else { return true };
        if let Some(answer) = self.answers.get(file) {
            return *answer;
        }
        if !self.relevant.contains(file) {
            return true;
        }
        let answer = self.prefix.get(self.asked.len()).copied().unwrap_or(true);
        self.asked.push((inside, answer));
        self.answers.insert(file.to_path_buf(), answer);
        answer
    }

    fn defining_files(&mut self, file: &Path, name: &str) -> Vec<PathBuf> {
        let mut found = Vec::new();
        let mut pending = vec![(file.to_path_buf(), name.to_string(), 0usize)];
        let mut index = 0;
        while index < pending.len() {
            let (file, name, depth) = pending[index].clone();
            index += 1;
            if depth > MAX_REEXPORT_DEPTH || !self.is_production(&file) {
                continue;
            }
            let module = self.module(&file);
            if module.defined.contains(&name) {
                found.push(file);
                continue;
            }
            for reexport in &module.reexports {
                let local = match &reexport.names {
                    None => (name != DEFAULT_EXPORT).then(|| name.clone()),
                    Some(names) => names.iter().find(|(exported, _)| *exported == name).map(|(_, local)| local.clone()),
                };
                if let (Some(target), Some(local)) = (reexport.target(&file), local) {
                    pending.push((target, local, depth + 1));
                }
            }
        }
        found
    }

    fn exported_constants(&mut self, file: &Path, only: Option<&HashSet<PathBuf>>) -> Vec<(String, Value)> {
        let mut found: Vec<(String, Value)> = Vec::new();
        let mut at: HashMap<String, usize> = HashMap::new();
        let mut visited: HashSet<PathBuf> = HashSet::new();
        let mut pending = vec![Step { file: file.to_path_buf(), depth: 0, rename: Rc::new(Rename::Identity) }];
        let mut index = 0;
        while index < pending.len() {
            let step = &pending[index];
            let (file, depth, rename) = (step.file.clone(), step.depth, step.rename.clone());
            index += 1;
            if visited.contains(&file) || !self.is_production(&file) {
                continue;
            }
            visited.insert(file.clone());
            let module = self.module(&file);
            let wanted = only.is_none_or(|only| depth == 0 || only.contains(&file));
            let fresh: Vec<(String, Value)> = module
                .constants
                .iter()
                .filter_map(|(name, value)| Some((renamed_head(name, |head| rename.apply(head))?, value.clone())))
                .filter(|(name, _)| wanted && is_constant_path(name) && !at.contains_key(name))
                .collect();
            for (name, value) in fresh {
                match at.get(&name) {
                    Some(place) => found[*place].1 = value,
                    None => {
                        at.insert(name.clone(), found.len());
                        found.push((name, value));
                    }
                }
            }
            if depth < MAX_REEXPORT_DEPTH {
                for reexport in &module.reexports {
                    if let Some(target) = reexport.target(&file) {
                        let outer = match &reexport.names {
                            None => rename.clone(),
                            Some(names) => Rc::new(Rename::Through(names.clone(), rename.clone())),
                        };
                        pending.push(Step { file: target, depth: depth + 1, rename: outer });
                    }
                }
            }
        }
        found
    }

    /// The constants of the loads that hold `key`.
    pub fn entries(&mut self, loads: &[&Load], key: &Key) -> Vec<Entry> {
        let mut entries = Vec::new();
        for load in loads {
            let only = (!load.whole).then(|| {
                let mut files = HashSet::new();
                for (name, _) in &load.names {
                    files.extend(self.defining_files(&load.target, name));
                }
                files
            });
            for (name, value) in self.exported_constants(&load.target, only.as_ref()) {
                if value.key() != *key {
                    continue;
                }
                let member = name.rsplit('.').next().unwrap_or(&name).to_string();
                let mut mentions = vec![member.clone()];
                if member == name {
                    mentions.extend(load.bound(&name).iter().cloned());
                }
                entries.push(Entry { name, owner: load.specifier.clone(), mentions });
            }
        }
        entries
    }
}

/// What the loads give for one value when the layout answers the way `asked` says.
pub struct Leaf {
    pub asked: Vec<(String, bool)>,
    pub entries: Vec<Entry>,
}

pub enum Outcome {
    Leaves(Vec<Leaf>),
    /// A module the parser could not read cleanly, or more ways than the walk will follow.
    Undecided,
}

/// Every way the layout answers can go for the files the walk asks about, each with what the test then sees.
pub fn leaves(root: &Path, loads: &[&Load], key: &Key) -> Outcome {
    let targets: Vec<&Path> = loads.iter().map(|load| load.target.as_path()).collect();
    let relevant = relevant_files(&targets, key);
    let mut stack: Vec<Vec<bool>> = vec![Vec::new()];
    let mut found = Vec::new();
    while let Some(prefix) = stack.pop() {
        if found.len() + stack.len() >= MAX_LEAVES {
            return Outcome::Undecided;
        }
        let mut eval = Eval::new(root, &prefix, &relevant);
        let entries = eval.entries(loads, key);
        if eval.unparsed {
            return Outcome::Undecided;
        }
        let asked = eval.asked;
        for at in prefix.len()..asked.len() {
            let mut next: Vec<bool> = asked[..at].iter().map(|(_, answer)| *answer).collect();
            next.push(false);
            stack.push(next);
        }
        found.push(Leaf { asked, entries });
    }
    Outcome::Leaves(found)
}
