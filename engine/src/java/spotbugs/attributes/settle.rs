//! Decides the field patterns once every file is read. Measured on test code:
//! - PA_PUBLIC_PRIMITIVE_ATTRIBUTE: a public non-final field of a top-level class (not an enum or interface) that
//!   a method of the class itself stores into (a lambda counts; a constructor, the static initializer, a method
//!   named `init` or `initialize` or a nested class does not). Any type. Priority 2. It sits on the first load or
//!   store SpotBugs meets in the whole run, in the file of the class that makes it.
//! - MS_*: a public or protected static field of a class whose compiled form is public (a member class declared
//!   public or protected, or one inside an interface). Without a load anywhere in the run the finding is priority
//!   3, which `-medium` hides. A class of another package that loads or stores the field turns MS_PKGPROTECT
//!   into MS_MUTABLE_ARRAY or MS_CANNOT_BE_FINAL. A final field: MS_PKGPROTECT when it is an array not known to
//!   be empty. A field stored outside the static initializer of its class: MS_PKGPROTECT. Otherwise a field that is an array not
//!   known to be empty, or a `Hashtable`, is MS_FINAL_PKGPROTECT; one the static initializer stores more than
//!   once is MS_SHOULD_BE_REFACTORED_TO_BE_FINAL; the rest are MS_SHOULD_BE_FINAL, priority 1 for a non-array
//!   object, else 2. They sit on the first store of the static initializer, or on no line.
use super::super::order::Visits;
use super::{Notes, Write, initializes, sets_inside};
use crate::engine::finding::Finding;
use crate::java::types::index::TypeIndex;
use crate::java::types::model::{ClassInfo, Field, Type, flag};
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};

type Key = (String, String);

#[derive(Default)]
pub struct Attributes {
    writes: Mutex<HashMap<Key, Vec<Write>>>,
    quiet: Mutex<HashMap<Key, (String, Vec<&'static str>)>>,
    names: OnceLock<HashSet<String>>,
}

/// The binary name and file of a class of the run.
fn binary(index: &TypeIndex, class: &str) -> String {
    super::super::names::binary_in(index, class)
}

fn nested(info: &ClassInfo) -> bool {
    let simple = if info.package.is_empty() { info.name.as_str() } else { info.name.get(info.package.len() + 1..).unwrap_or_default() };
    simple.contains('.')
}

/// Whether the class file of a class is public: a member class declared protected is public there too, and a
/// member of an interface is public.
fn compiled_public(index: &TypeIndex, info: &ClassInfo) -> bool {
    if !nested(info) {
        return info.flags & flag::PUBLIC != 0;
    }
    let outer = info.name.rsplit_once('.').and_then(|(outer, _)| index.get(outer));
    info.flags & (flag::PUBLIC | flag::PROTECTED) != 0 || outer.is_some_and(|outer| outer.is_interface)
}

fn field<'i>(index: &'i TypeIndex, key: &Key) -> Option<(&'i ClassInfo, &'i Field)> {
    let info = index.get(&key.0)?;
    Some((info, info.fields.iter().find(|field| field.name == key.1)?))
}

fn finding(rule: &str, message: String, at: Result<&Write, &String>, place: String, priority: u8, argument: String) -> Finding {
    let (file, line) = match at {
        Ok(write) => (write.file.clone(), write.line),
        Err(declared) => (declared.clone(), 0),
    };
    Finding { file, line, column: 1, rule: rule.to_string(), message, symbol: Some(place), priority: Some(priority), arguments: Some(vec![argument]) }
}

impl Attributes {
    /// The names of the fields of the run's classes whose loads count: public or protected static fields, and
    /// public non-final fields of top-level classes.
    pub fn names(&self, index: &TypeIndex, classes: &HashMap<String, String>) -> &HashSet<String> {
        self.names.get_or_init(|| {
            let mut found = HashSet::new();
            for info in classes.keys().filter_map(|class| index.get(class)) {
                let plain = plain_class(info);
                let counts = |field: &&Field| {
                    let is = |bit: u32| field.flags & bit != 0;
                    (is(flag::STATIC) && is(flag::PUBLIC | flag::PROTECTED)) || (plain && is(flag::PUBLIC) && !is(flag::FINAL))
                };
                found.extend(info.fields.iter().filter(counts).map(|field| field.name.clone()));
            }
            found
        })
    }

    pub fn note(&self, notes: Notes) {
        if !notes.writes.is_empty() {
            let mut all = self.writes.lock().expect("writes");
            for write in notes.writes {
                all.entry(write.key.clone()).or_default().push(write);
            }
        }
        self.quiet.lock().expect("quiet").extend(notes.quiet);
    }

    pub fn settle(&self, index: &TypeIndex, visits: impl FnOnce() -> Visits, out: &mut Vec<Finding>) {
        let quiet = self.quiet.lock().expect("quiet");
        if quiet.is_empty() {
            return;
        }
        let writes = self.writes.lock().expect("writes");
        let mut visits = Some(visits);
        let mut ranked: Option<Visits> = None;
        let mut keys: Vec<&Key> = quiet.keys().collect();
        keys.sort();
        for key in keys {
            let Some((info, declared)) = field(index, key) else { continue };
            let (declared_in, off) = &quiet[key];
            let stores: &[Write] = writes.get(key).map_or(&[], Vec::as_slice);
            let name = format!("{}.{}", binary(index, &info.name), key.1);
            let place = format!("member:{name}");
            let is = |bit: u32| declared.flags & bit != 0;
            let rule = "PA_PUBLIC_PRIMITIVE_ATTRIBUTE";
            if !off.contains(&rule) && plain_class(info) && is(flag::PUBLIC) && !is(flag::FINAL) && stores.iter().any(sets_inside) {
                let visits = ranked.get_or_insert_with(|| (visits.take().expect("visits once"))());
                let rank = |write: &Write| (visits.rank(&write.by).unwrap_or((true, u32::MAX)), write.order, write.file.clone());
                let first = stores.iter().min_by_key(|write| rank(write)).ok_or(declared_in);
                let message = format!("Primitive field {name} is public and set from inside the class, which makes it too exposed. Consider making it private to limit external accessibility.");
                out.push(finding(rule, message, first, place.clone(), 2, name.clone()));
            }
            if let Some((rule, priority)) = mutable_static(index, info, declared, stores).filter(|(rule, _)| !off.contains(rule)) {
                let first = stores.iter().filter(|write| initializes(write)).min_by_key(|write| write.order).ok_or(declared_in);
                let message = match rule {
                    "MS_SHOULD_BE_FINAL" => format!("{name} isn't final but should be"),
                    _ => format!("{name} should be package protected"),
                };
                out.push(finding(rule, message, first, place, priority, name));
            }
        }
    }
}

fn plain_class(info: &ClassInfo) -> bool {
    !nested(info) && !info.is_interface && info.flags & (flag::ENUM | flag::ANNOTATION) == 0
}

fn mutable_static(index: &TypeIndex, info: &ClassInfo, declared: &Field, accesses: &[Write]) -> Option<(&'static str, u8)> {
    let is = |bit: u32| declared.flags & bit != 0;
    let read = accesses.iter().any(|access| !access.store);
    let abroad = accesses.iter().any(|access| access.package != info.package);
    let stores: Vec<&Write> = accesses.iter().filter(|access| access.store).collect();
    if !read || !is(flag::STATIC) || !is(flag::PUBLIC | flag::PROTECTED) || info.is_interface || !compiled_public(index, info) {
        return None;
    }
    let initial: Vec<&&Write> = stores.iter().filter(|write| initializes(write)).collect();
    let array = matches!(declared.kind, Type::Array(_));
    let empty = array && initial.len() == 1 && initial[0].empty;
    if is(flag::FINAL) {
        return (array && !empty && !abroad).then_some(("MS_PKGPROTECT", 2));
    }
    if stores.iter().any(|write| !initializes(write)) {
        return (!abroad).then_some(("MS_PKGPROTECT", 2));
    }
    if (array && !empty) || declared.kind.name() == "java.util.Hashtable" || initial.len() > 1 {
        return None;
    }
    Some(("MS_SHOULD_BE_FINAL", if matches!(declared.kind, Type::Class(..)) { 1 } else { 2 }))
}
