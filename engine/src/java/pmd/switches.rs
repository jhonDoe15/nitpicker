//! What PMD says about a switch as a whole: whether it has a default case and whether its cases cover every value.
use crate::java::types::model::Type;
use crate::java::types::scope::Resolver;
use tree_sitter::Node;

pub struct SwitchFacts {
    pub default_case: bool,
    pub exhaustive_enum: bool,
    pub exhaustive: bool,
}

/// `labels` is the number of constants and patterns over all case labels; `patterns` are the written types of the type
/// patterns that stand directly in a label.
pub fn facts(
    resolver: &Resolver,
    tested: Option<Node>,
    default_case: bool,
    any_pattern: bool,
    labels: usize,
    patterns: &[Node],
) -> SwitchFacts {
    let tested = tested.and_then(|tested| resolver.type_of(tested));
    let class = match &tested {
        Some(Type::Class(name, _)) => resolver.index.get(name),
        _ => None,
    };
    let exhaustive_enum = class
        .and_then(|class| class.enum_constants)
        .is_some_and(|constants| constants as usize == labels);
    // Without a default case, the compiler has already checked a switch over patterns or over a sealed type.
    let compiler_checked =
        !default_case && (any_pattern || class.is_some_and(|class| class.permitted.is_some()));
    let exhaustive = compiler_checked
        || match class.and_then(|class| class.permitted.as_ref()) {
            Some(permitted) => {
                let checked: Vec<String> = patterns
                    .iter()
                    .filter_map(|written| resolver.written(*written, true))
                    .map(|kind| kind.erased().name())
                    .collect();
                permitted
                    .iter()
                    .filter(|name| !checked.contains(name))
                    .all(|open| {
                        // One level down: a permitted type that is sealed itself is covered when all it permits is covered.
                        resolver
                            .index
                            .get(open)
                            .and_then(|info| info.permitted.as_ref())
                            .is_some_and(|inner| inner.iter().all(|name| checked.contains(name)))
                    })
            }
            None => exhaustive_enum,
        };
    SwitchFacts {
        default_case,
        exhaustive_enum,
        exhaustive,
    }
}
