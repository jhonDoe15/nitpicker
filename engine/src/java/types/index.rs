//! Project-wide type index: classes from the JDK, jars and class folders, and from the parsed sources.
use super::classfile;
use super::model::{ClassInfo, Field, Method, OBJECT, Type};
use rayon::prelude::*;
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

/// Where the bytes of a class not read yet are.
enum Origin {
    Archive(Arc<Mutex<Archive>>, usize),
    File(PathBuf),
}

type Archive = zip::ZipArchive<std::io::BufReader<std::fs::File>>;

/// A class of the index. Classes of jars and class folders are read and parsed when first asked for:
/// a run touches a small part of its class path.
enum Slot {
    Ready(ClassInfo),
    Later(Origin, OnceLock<Option<ClassInfo>>),
}

#[derive(Default)]
pub struct TypeIndex {
    classes: HashMap<String, Slot>,
    /// Ancestors per class, kept once the index no longer changes.
    lineages: std::sync::RwLock<HashMap<String, std::sync::Arc<Vec<String>>>>,
    /// Per class, whether NullAway takes its code as checked.
    checked: std::sync::RwLock<HashMap<String, bool>>,
    settled: bool,
    /// The classes of the source files that the class path holds too.
    compiled: HashSet<String>,
    pub binary_classes: usize,
    pub source_classes: usize,
    /// Packages whose methods must have their result used, each with its subpackages: the outermost source packages.
    pub checked_packages: Vec<String>,
}

/// The class names of an archive, with where each one is.
fn archive_classes(path: &Path) -> Vec<(String, Origin)> {
    let Ok(file) = std::fs::File::open(path) else { return Vec::new() };
    let Ok(archive) = zip::ZipArchive::new(std::io::BufReader::new(file)) else { return Vec::new() };
    let named: Vec<(String, usize)> = (0..archive.len())
        .filter_map(|position| {
            let name = archive.name_for_index(position)?.ok()?;
            let inner = name.strip_suffix(".class")?;
            if inner.ends_with("module-info") || name.contains("META-INF/versions") {
                return None;
            }
            Some((classfile::dotted(inner.strip_prefix("classes/").unwrap_or(inner)), position))
        })
        .collect();
    let shared = Arc::new(Mutex::new(archive));
    named.into_iter().map(|(name, position)| (name, Origin::Archive(shared.clone(), position))).collect()
}

/// The classes `ct.sym` keeps for one release: `<releases>/<module>/<package path>/<Class>.sig`, where the
/// first folder is named by one character per release it holds for (`8`, `9`, `A` for 10, `B` for 11 and on).
fn release_classes(path: &Path, release: u32) -> Vec<(String, Origin)> {
    let Some(letter) = char::from_digit(release, 36).map(|letter| letter.to_ascii_uppercase()) else { return Vec::new() };
    let Ok(file) = std::fs::File::open(path) else { return Vec::new() };
    let Ok(archive) = zip::ZipArchive::new(std::io::BufReader::new(file)) else { return Vec::new() };
    let named: Vec<(String, usize)> = (0..archive.len())
        .filter_map(|position| {
            let name = archive.name_for_index(position)?.ok()?;
            let (releases, rest) = name.split_once('/')?;
            let (_, inner) = rest.split_once('/')?;
            let inner = inner.strip_suffix(".sig")?;
            (releases.contains(letter) && !inner.ends_with("module-info")).then(|| (classfile::dotted(inner), position))
        })
        .collect();
    let shared = Arc::new(Mutex::new(archive));
    named.into_iter().map(|(name, position)| (name, Origin::Archive(shared.clone(), position))).collect()
}

fn folder_classes(path: &Path) -> Vec<(String, Origin)> {
    walkdir::WalkDir::new(path)
        .into_iter()
        .filter_map(Result::ok)
        .map(|entry| entry.into_path())
        .filter(|file| file.extension().is_some_and(|e| e == "class"))
        .filter_map(|file| {
            let inner = file.strip_prefix(path).ok()?.with_extension("");
            let name = classfile::dotted(&inner.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/"));
            (!name.ends_with("module-info")).then_some((name, Origin::File(file)))
        })
        .collect()
}

fn read(origin: &Origin) -> Option<ClassInfo> {
    let bytes = match origin {
        Origin::File(path) => std::fs::read(path).ok()?,
        Origin::Archive(archive, position) => {
            let mut archive = archive.lock().ok()?;
            let mut entry = archive.by_index(*position).ok()?;
            let mut bytes = Vec::with_capacity(entry.size().min(1 << 24) as usize);
            entry.read_to_end(&mut bytes).ok()?;
            bytes
        }
    };
    classfile::parse(&bytes)
}

fn anonymous(name: &str) -> bool {
    name.rsplit('.').next().is_some_and(|last| last.chars().next().is_some_and(|c| c.is_ascii_digit()))
}

impl TypeIndex {
    /// Entries are jars, jmods or class folders. Earlier entries win, like a class path.
    pub fn load_binaries(&mut self, entries: &[PathBuf]) {
        let loaded: Vec<Vec<(String, Origin)>> = entries
            .par_iter()
            .map(|entry| if entry.is_dir() { folder_classes(entry) } else { archive_classes(entry) })
            .collect();
        for (name, origin) in loaded.into_iter().flatten() {
            if anonymous(&name) {
                continue;
            }
            if self.classes.contains_key(&name) {
                self.compiled.insert(name);
            } else {
                self.classes.insert(name, Slot::Later(origin, OnceLock::new()));
                self.binary_classes += 1;
            }
        }
    }

    /// Loads the JDK library as one older release had it. False when the file does not hold that release.
    pub fn load_release(&mut self, signatures: &Path, release: u32) -> bool {
        let loaded = release_classes(signatures, release);
        let found = !loaded.is_empty();
        for (name, origin) in loaded {
            if !anonymous(&name) && !self.classes.contains_key(&name) {
                self.classes.insert(name, Slot::Later(origin, OnceLock::new()));
                self.binary_classes += 1;
            }
        }
        found
    }

    pub fn put(&mut self, class: ClassInfo) {
        if matches!(self.classes.get(&class.name), Some(Slot::Later(..))) {
            self.compiled.insert(class.name.clone());
        }
        self.classes.insert(class.name.clone(), Slot::Ready(class));
    }

    /// Whether the class comes from a source file of this run, not from the class path.
    pub fn from_source(&self, name: &str) -> bool {
        matches!(self.classes.get(name), Some(Slot::Ready(_)))
    }

    pub fn get(&self, name: &str) -> Option<&ClassInfo> {
        match self.classes.get(name)? {
            Slot::Ready(class) => Some(class),
            Slot::Later(origin, cell) => cell.get_or_init(|| read(origin)).as_ref(),
        }
    }

    /// Whether NullAway takes the code of a class as checked. `listed` says that the configured packages hold
    /// the class. A top-level class counts when its package is listed or carries `@NullMarked`, unless the
    /// package carries `@NullUnmarked`, or when the class itself carries `@NullMarked`; `@NullUnmarked` on the
    /// class switches it off. A member class follows the class around it unless it carries one of the two.
    pub fn null_checked(&self, name: &str, listed: bool) -> bool {
        if let Some(known) = self.checked.read().ok().and_then(|known| known.get(name).copied()) {
            return known;
        }
        let found = self.read_null_checked(name, listed);
        if self.settled && let Ok(mut known) = self.checked.write() {
            known.insert(name.to_string(), found);
        }
        found
    }

    fn read_null_checked(&self, name: &str, listed: bool) -> bool {
        use super::model::flag;
        let Some(package) = self.get(name).map(|class| class.package.as_str()) else { return listed };
        let flags_of = |class: &str| self.get(class).map_or(0, |info| info.flags);
        let start = if package.is_empty() { 0 } else { package.len() + 1 };
        let mut end = name[start..].find('.').map_or(name.len(), |dot| start + dot);
        let on_package = flags_of(&format!("{package}.package-info"));
        let on_top = flags_of(&name[..end]);
        let by_package = (listed || on_package & flag::NULL_MARKED != 0) && on_package & flag::NULL_UNMARKED == 0;
        let mut checked = on_top & flag::NULL_UNMARKED == 0 && (by_package || on_top & flag::NULL_MARKED != 0);
        while end < name.len() {
            end = name[end + 1..].find('.').map_or(name.len(), |dot| end + 1 + dot);
            let flags = flags_of(&name[..end]);
            if flags & flag::NULL_UNMARKED != 0 {
                checked = false;
            } else if flags & flag::NULL_MARKED != 0 {
                checked = true;
            }
        }
        checked
    }

    pub fn has(&self, name: &str) -> bool {
        self.classes.contains_key(name)
    }

    /// The class and every supertype, nearest first. Unknown supertypes are still listed by name.
    /// Tells the index that no class will be added or replaced any more.
    pub fn settle(&mut self) {
        self.settled = true;
    }

    /// The class and everything it extends or implements, nearest first.
    pub fn lineage(&self, name: &str) -> std::sync::Arc<Vec<String>> {
        if !self.settled {
            return std::sync::Arc::new(self.walk_up(name));
        }
        if let Some(known) = self.lineages.read().ok().and_then(|known| known.get(name).cloned()) {
            return known;
        }
        let found = std::sync::Arc::new(self.walk_up(name));
        if let Ok(mut known) = self.lineages.write() {
            known.insert(name.to_string(), found.clone());
        }
        found
    }

    fn walk_up(&self, name: &str) -> Vec<String> {
        let mut seen = HashSet::new();
        let mut queue = std::collections::VecDeque::from([name.to_string()]);
        let mut order = Vec::new();
        if name.contains('&') {
            seen.insert(name.to_string());
            order.push(name.to_string());
            queue = name.split('&').map(str::to_string).collect();
        }
        while let Some(current) = queue.pop_front() {
            if !seen.insert(current.clone()) {
                continue;
            }
            if let Some(class) = self.get(&current) {
                queue.extend(class.superclass.iter().cloned());
                queue.extend(class.interfaces.iter().cloned());
                if class.superclass.is_none() && current != OBJECT {
                    queue.push_back(OBJECT.to_string());
                }
            }
            order.push(current);
        }
        order
    }

    pub fn is_subtype(&self, name: &str, of: &str) -> bool {
        if of.contains('&') && name != of {
            return of.split('&').all(|part| self.is_subtype(name, part));
        }
        name == of || of == "java.lang.Object" || self.lineage(name).iter().any(|ancestor| ancestor == of)
    }

    /// PMD's typeIs for a class type. PMD erases the supertypes of a raw type, and an erased type that takes no type
    /// arguments is no subtype of its plain self there: a raw `Serde` is no `Closeable`, while `Serde<String>` is one.
    /// PMD loads the named class from the class path. One it finds only in the sources it takes for a class without
    /// type parameters, so a generic class of the sources is treated the same way.
    pub fn is_subtype_as_pmd(&self, name: &str, raw: bool, of: &str) -> bool {
        if !self.is_subtype(name, of) {
            return false;
        }
        if name == of || name.contains('&') || of.contains('&') || matches!(of, OBJECT | "java.lang.Cloneable" | "java.io.Serializable") {
            return true;
        }
        let Some(target) = self.get(of) else { return true };
        let loaded = matches!(self.classes.get(of), Some(Slot::Later(..))) || self.compiled.contains(of);
        if loaded && !target.type_parameters.is_empty() {
            return true;
        }
        let raw = raw && self.generic(name);
        self.plain_path(name, raw, (of, target.is_interface), &mut HashSet::new()).unwrap_or(true)
    }

    /// The type a declaration stands for: a generic class with a wildcard for each parameter, so it does not read as raw.
    pub fn declared(&self, name: &str) -> Type {
        Type::Class(name.to_string(), vec![Type::Wildcard; self.get(name).map_or(0, |info| info.type_parameters.len())])
    }

    /// Whether a member of the declaring class is reached through a raw type from the owner: the owner is raw, or a
    /// class on the way up names its parent without type arguments. PMD erases the types of such members.
    pub fn seen_raw(&self, owner: &Type, declaring: &str) -> bool {
        let Type::Class(name, given) = owner else { return false };
        let Some(target) = self.get(declaring).filter(|target| !target.type_parameters.is_empty()) else { return false };
        let raw = given.is_empty() && self.generic(name);
        self.plain_path(name, raw, (declaring, target.is_interface), &mut HashSet::new()) == Some(false)
    }

    /// Whether the first way up to the class, superclass first, keeps its type arguments at every step.
    fn plain_path(&self, name: &str, erased: bool, target: (&str, bool), dead: &mut HashSet<String>) -> Option<bool> {
        if name == target.0 {
            return Some(!erased);
        }
        let info = self.get(name).filter(|_| dead.insert(name.to_string()))?;
        let parents = info.superclass.iter().chain(info.interfaces.iter().filter(|_| target.1));
        for parent in parents {
            let bare = info.generic_supers.iter().find(|above| above.name() == *parent).is_none_or(|above| matches!(above, Type::Class(_, given) if given.is_empty()));
            let found = self.plain_path(parent, erased || (bare && self.generic(parent)), target, dead);
            if found.is_some() {
                return found;
            }
        }
        None
    }

    /// The generic type of each component of a record, in order.
    pub fn record_components(&self, class: &str) -> Option<Vec<Type>> {
        self.get(class)?.record_components.clone()
    }

    /// A field the class declares or inherits. A field without a visibility modifier is only inherited inside its package.
    pub fn field(&self, class: &str, name: &str) -> Option<(&ClassInfo, &Field)> {
        let package = self.get(class).map(|own| own.package.as_str());
        let inherited = |info: &ClassInfo, field: &Field| {
            let open = info.is_interface || field.flags & (super::model::flag::PUBLIC | super::model::flag::PROTECTED) != 0;
            !field.is_private && (open || package.is_none_or(|package| package == info.package))
        };
        self.lineage(class)
            .iter()
            .filter_map(|ancestor| self.get(ancestor))
            .find_map(|info| info.fields.iter().find(|field| field.name == name && (info.name == class || inherited(info, field))).map(|field| (info, field)))
    }

    /// Whether a field read through that class is a compile-time constant. PMD takes more for a constant when the
    /// field is declared in the file that reads it (`near` tells): any type, and arrays written in braces.
    pub fn constant_field(&self, class: &str, name: &str, near: &dyn Fn(&str) -> bool, strict: bool, depth: usize) -> bool {
        let Some((info, field)) = self.field(class, name) else {
            // A constant of a class around this one.
            return class.rsplit_once('.').is_some_and(|(outer, _)| self.has(outer) && self.constant_field(outer, name, near, strict, depth));
        };
        let Some(uses) = &field.fixed else { return false };
        let strict = strict || !near(&info.name);
        depth < 12
            && (field.strict || !strict)
            && uses.iter().all(|(owner, used)| {
                self.constant_field(if owner.is_empty() { &info.name } else { owner }, used, near, strict, depth + 1)
            })
    }

    fn bindings(&self, info: &ClassInfo, arguments: &[Type]) -> HashMap<String, Type> {
        let raw = arguments.len() != info.type_parameters.len();
        let given = |position: usize| arguments.get(position).filter(|given| !raw && **given != Type::Wildcard);
        let written: HashMap<String, Type> = info
            .type_parameters
            .iter()
            .enumerate()
            .filter_map(|(position, (name, _))| given(position).map(|given| (name.clone(), given.clone())))
            .collect();
        let unwritten: HashMap<String, Type> =
            info.type_parameters.iter().filter(|(name, _)| !written.contains_key(name)).map(|(name, _)| (name.clone(), Type::Wildcard)).collect();
        info.type_parameters
            .iter()
            .enumerate()
            .map(|(position, (name, bound))| {
                // A wildcard stands for the bound of its parameter, which may name the other parameters:
                // `Assert<?, E>` with `SELF extends Assert<SELF, E>` is an `Assert<?, E>` of the written `E`.
                let filled = match (given(position), info.written_bounds.get(position)) {
                    (Some(given), _) => given.clone(),
                    (None, Some(Type::Class(owner, bounds))) if !written.is_empty() && !bounds.is_empty() => {
                        Type::Class(owner.clone(), bounds.clone()).substitute(&written).substitute(&unwritten)
                    }
                    // A bound written with type arguments is not a raw type, whatever the arguments are.
                    (None, Some(Type::Class(owner, bounds))) if !bounds.is_empty() => Type::Class(owner.clone(), vec![Type::Wildcard; bounds.len()]),
                    _ => bound.clone(),
                };
                (name.clone(), filled)
            })
            .collect()
    }

    fn arguments_at(&self, name: &str, arguments: &[Type], target: &str, depth: u8) -> Option<Vec<Type>> {
        if name.contains('&') && name != target {
            return name.split('&').find_map(|part| self.arguments_at(part, &[], target, depth + 1));
        }
        let info = self.get(name);
        let map = info.map(|info| self.bindings(info, arguments)).unwrap_or_default();
        if name == target {
            return Some(match info {
                Some(info) => info.type_parameters.iter().map(|(parameter, _)| map[parameter].clone()).collect(),
                None => arguments.to_vec(),
            });
        }
        if depth > 24 {
            return None;
        }
        info?.generic_supers.iter().find_map(|ancestor| match ancestor.substitute(&map) {
            Type::Class(next, given) => self.arguments_at(&next, &given, target, depth + 1),
            _ => None,
        })
    }

    /// The type arguments a type has when seen as one of its supertypes: ArrayList<String> as Iterable gives [String].
    pub fn arguments_as(&self, kind: &Type, target: &str) -> Option<Vec<Type>> {
        match kind {
            Type::Class(name, arguments) => self.arguments_at(name, arguments, target, 0),
            _ => None,
        }
    }

    /// What the type parameters of `declaring` stand for when a member is used through `receiver`.
    pub fn member_map(&self, receiver: &Type, declaring: &str) -> HashMap<String, Type> {
        let Some(info) = self.get(declaring) else { return HashMap::new() };
        let arguments = self.arguments_as(receiver, declaring).unwrap_or_default();
        let mut map = self.bindings(info, &arguments);
        // An inner class also sees the type parameters of the classes around it; those stand for their bounds here.
        let mut around: HashMap<String, Type> = HashMap::new();
        for start in [receiver.name(), declaring.to_string()] {
            let mut outer = start.as_str();
            while let Some((parent, _)) = outer.rsplit_once('.') {
                for (name, bound) in self.get(parent).map(|info| info.type_parameters.as_slice()).unwrap_or_default() {
                    around.entry(name.clone()).or_insert_with(|| bound.clone());
                }
                outer = parent;
            }
        }
        if !around.is_empty() {
            for kind in map.values_mut() {
                if kind.mentions_variable() {
                    *kind = kind.substitute(&around);
                }
            }
            for (name, bound) in around {
                map.entry(name).or_insert(bound);
            }
        }
        map
    }

    pub fn generic(&self, name: &str) -> bool {
        self.get(name).is_some_and(|info| !info.type_parameters.is_empty())
    }

    /// The single abstract method of a functional interface.
    pub fn functional_method(&self, interface: &str) -> Option<(&ClassInfo, &Method)> {
        let mut seen: Vec<(&ClassInfo, &Method)> = Vec::new();
        self.get(interface).filter(|info| info.is_interface)?;
        for ancestor in self.lineage(interface).iter() {
            let Some(info) = self.get(ancestor).filter(|info| info.is_interface) else { continue };
            for method in &info.methods {
                let inherited = matches!(method.name.as_str(), "equals" | "hashCode" | "toString");
                let known = seen.iter().any(|(_, other)| other.name == method.name && other.parameters.len() == method.parameters.len());
                if !inherited && !known {
                    seen.push((info, method));
                }
            }
        }
        let mut open = seen.into_iter().filter(|(_, method)| method.is_abstract);
        let only = open.next()?;
        open.next().is_none().then_some(only)
    }

    pub fn superclasses(&self, class: &str) -> Vec<String> {
        let mut chain = Vec::new();
        let mut current = Some(class.to_string());
        while let Some(name) = current.filter(|name| !chain.contains(name)) {
            current = self.get(&name).and_then(|info| info.superclass.clone());
            chain.push(name);
        }
        chain
    }

    /// Superclasses first, then interfaces: a class method wins over an interface one.
    fn member_order(&self, class: &str) -> Vec<String> {
        let mut chain = Vec::new();
        let mut current = Some(class.to_string());
        while let Some(name) = current.filter(|name| !chain.contains(name)) {
            current = self.get(&name).and_then(|info| info.superclass.clone());
            chain.push(name);
        }
        if !chain.iter().any(|name| name == OBJECT) {
            chain.push(OBJECT.to_string());
        }
        let rest: Vec<String> = self.lineage(class).iter().filter(|name| !chain.contains(name)).cloned().collect();
        chain.extend(rest);
        chain
    }

    /// Methods of that name with the nearest declaration of each parameter list first.
    pub fn methods(&self, class: &str, name: &str) -> Vec<(&ClassInfo, &Method)> {
        let mut found: Vec<(&ClassInfo, &Method)> = Vec::new();
        for ancestor in self.member_order(class) {
            let Some(info) = self.get(&ancestor) else { continue };
            let hidden = |method: &Method| info.name != class && (method.is_private || (info.is_interface && method.is_static));
            for method in info.methods.iter().filter(|method| method.name == name && !hidden(method)) {
                if !found.iter().any(|(_, other)| other.parameters == method.parameters) {
                    found.push((info, method));
                }
            }
        }
        found
    }

    /// Whether a known class below `class`, from the run's sources or already read from the class path, declares
    /// an instance method of that name and parameter count.
    pub fn overridden_in_sources(&self, class: &str, name: &str, parameters: usize) -> bool {
        self.classes.values().any(|slot| match slot {
            Slot::Ready(other) => {
                other.name != class
                    && other.methods.iter().any(|method| method.name == name && method.parameters.len() == parameters && !method.is_static)
                    && self.is_subtype(&other.name, class)
            }
            Slot::Later(..) => false,
        })
    }

    /// Whether every supertype up to the roots is known, so a negative subtype answer can be trusted.
    pub fn complete(&self, name: &str) -> bool {
        self.lineage(name).iter().all(|ancestor| ancestor.contains('&') || self.classes.contains_key(ancestor))
    }
}
