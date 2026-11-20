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
            let mut bytes = Vec::with_capacity(entry.size() as usize);
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
            if !anonymous(&name) && !self.classes.contains_key(&name) {
                self.classes.insert(name, Slot::Later(origin, OnceLock::new()));
                self.binary_classes += 1;
            }
        }
    }

    pub fn put(&mut self, class: ClassInfo) {
        self.classes.insert(class.name.clone(), Slot::Ready(class));
    }

    pub fn get(&self, name: &str) -> Option<&ClassInfo> {
        match self.classes.get(name)? {
            Slot::Ready(class) => Some(class),
            Slot::Later(origin, cell) => cell.get_or_init(|| read(origin)).as_ref(),
        }
    }

    pub fn has(&self, name: &str) -> bool {
        self.classes.contains_key(name)
    }

    /// The class and every supertype, nearest first. Unknown supertypes are still listed by name.
    pub fn lineage(&self, name: &str) -> Vec<String> {
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

    pub fn field(&self, class: &str, name: &str) -> Option<(&ClassInfo, &Field)> {
        self.lineage(class)
            .iter()
            .filter_map(|ancestor| self.get(ancestor))
            .find_map(|info| info.fields.iter().find(|field| field.name == name && (!field.is_private || info.name == class)).map(|field| (info, field)))
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
        info.type_parameters
            .iter()
            .enumerate()
            .map(|(position, (name, bound))| {
                let given = arguments.get(position).filter(|given| !raw && **given != Type::Wildcard);
                (name.clone(), given.unwrap_or(bound).clone())
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
        for ancestor in self.lineage(interface) {
            let Some(info) = self.get(&ancestor).filter(|info| info.is_interface) else { continue };
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
        let rest: Vec<String> = self.lineage(class).into_iter().filter(|name| !chain.contains(name)).collect();
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

    /// Whether every supertype up to the roots is known, so a negative subtype answer can be trusted.
    pub fn complete(&self, name: &str) -> bool {
        self.lineage(name).iter().all(|ancestor| ancestor.contains('&') || self.classes.contains_key(ancestor))
    }
}
