//! Which fields and method results SpotBugs takes as possibly null: the ones carrying `@CheckForNull` or an
//! annotation that is a nickname for it (an annotation class that itself carries `@CheckForNull`). A plain
//! `@Nullable` that is no such nickname says nothing to SpotBugs' null detector.
use crate::java::types::index::TypeIndex;
use crate::java::types::model::{ClassInfo, Field, Method, flag};

fn flagged(index: &TypeIndex, class: &ClassInfo, flags: u16) -> bool {
    let nickname = |name: &String| index.get(name).is_some_and(|annotation| annotation.flags & flag::CHECK_FOR_NULL != 0);
    flags & flag::CHECK_FOR_NULL != 0 || (flags & flag::MAYBE_CHECK_FOR_NULL != 0 && class.null_nicknames.iter().any(nickname))
}

pub fn field(index: &TypeIndex, class: &ClassInfo, field: &Field) -> bool {
    flagged(index, class, field.flags)
}

/// A method's result is marked on the method itself or on a method it overrides.
pub fn method(index: &TypeIndex, declaring: &str, method: &Method) -> bool {
    let same = |other: &Method| other.name == method.name && other.parameters == method.parameters && other.is_static == method.is_static;
    let marked = |class: &str| index.get(class).is_some_and(|info| info.methods.iter().any(|other| same(other) && flagged(index, info, other.flags)));
    if method.is_static || method.name == "<init>" {
        return marked(declaring);
    }
    marked(declaring) || index.lineage(declaring).iter().any(|ancestor| marked(ancestor))
}
