//! URF_UNREAD_FIELD and URF_UNREAD_PUBLIC_OR_PROTECTED_FIELD, measured on test code: an instance field that is not
//! final, that the run stores into and never loads (`this.f = this.f` does not count as a load; `o.f = o.f` does).
//! A static or final field is priority 3, and so is any field of a class whose `Class` object the run names (a class
//! literal, `Class.forName` with a constant name, or an `assert`, which names the outermost class), so `-medium`
//! hides them. A class that is serializable (but for a field named `serialVersionUID`), or that declares a native
//! method, is skipped, and so is a field whose name starts with `_`. Public and protected fields take the second
//! pattern. The finding sits on the first store SpotBugs meets: classes in visiting order, a class's methods in the
//! order javac writes them.
use super::super::order::Visits;
use super::Write;
use crate::java::types::index::TypeIndex;
use crate::java::types::model::{ClassInfo, Field, flag};
use std::collections::HashSet;

pub const UNREAD: &str = "URF_UNREAD_FIELD";
pub const UNREAD_OPEN: &str = "URF_UNREAD_PUBLIC_OR_PROTECTED_FIELD";

const NATIVE: u16 = 0x100;

/// The pattern an unread field takes at priority 2, if it is one.
pub fn unread(index: &TypeIndex, literals: &HashSet<String>, info: &ClassInfo, declared: &Field, accesses: &[Write]) -> Option<&'static str> {
    let is = |bit: u32| declared.flags & bit != 0;
    let loaded = accesses.iter().any(|access| !access.store && !access.copy);
    if is(flag::STATIC | flag::FINAL) || declared.name.starts_with('_') || !accesses.iter().any(|access| access.store) || loaded {
        return None;
    }
    let native = info.methods.iter().any(|method| method.detail.access & NATIVE != 0);
    if native || literals.contains(&info.name) || (declared.name != "serialVersionUID" && index.is_subtype(&info.name, "java.io.Serializable")) || !index.complete(&info.name) {
        return None;
    }
    Some(if is(flag::PUBLIC | flag::PROTECTED) { UNREAD_OPEN } else { UNREAD })
}

/// The store SpotBugs meets first.
pub fn first_store(accesses: &[Write], visits: &Visits) -> Option<Write> {
    let rank = |write: &Write| (visits.rank(&write.by).unwrap_or((true, u32::MAX)), write.code, write.file.clone());
    accesses.iter().filter(|access| access.store).min_by_key(|write| rank(write)).cloned()
}

pub fn message(rule: &str, name: &str) -> String {
    if rule == UNREAD_OPEN { format!("Unread public/protected field: {name}") } else { format!("Unread field: {name}") }
}
