//! The order SpotBugs visits the classes of a run in. What it knows about a field while it looks at one class
//! depends on the classes it has already seen. Measured on test code: the order is that of a Java hash table keyed
//! by the class name with slashes, sized for the number of classes of the run.
use super::{Context, names};

fn java_hash(text: &str) -> u32 {
    text.encode_utf16().fold(0u32, |hash, unit| hash.wrapping_mul(31).wrapping_add(u32::from(unit)))
}

fn capacity(classes: usize) -> u32 {
    let mut size = 16u32;
    while classes * 4 > size as usize * 3 {
        size *= 2;
    }
    size
}

fn slot(context: &Context, class: &str) -> u32 {
    let hash = java_hash(&names::binary(context, class).replace('.', "/"));
    (hash ^ (hash >> 16)) & (capacity(context.resolver.index.source_classes) - 1)
}

/// Whether SpotBugs has been through `first` when it looks at `second`. Two classes in the same slot come in the
/// order the classes were handed over, which the sources do not tell: taken as not before.
pub fn before(context: &Context, first: &str, second: &str) -> bool {
    slot(context, first) < slot(context, second)
}
