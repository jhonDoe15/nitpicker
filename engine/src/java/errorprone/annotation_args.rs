//! Reading the arguments of an annotation as Error Prone's matchers do: `value` is the implicit name of a lone argument.
use crate::engine::source::named_children;
use tree_sitter::Node;

/// The arguments of an annotation, without comments: `element_value_pair`s, or one bare value.
pub fn annotation_arguments<'t>(annotation: Node<'t>) -> Vec<Node<'t>> {
    let list = annotation.child_by_field_name("arguments").map(named_children).unwrap_or_default();
    list.into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

/// The expression given for the argument called `name`: a bare lone value counts as `value`.
pub fn annotation_value<'t>(source: &str, annotation: Node<'t>, name: &str) -> Option<Node<'t>> {
    let arguments = annotation_arguments(annotation);
    for argument in &arguments {
        if argument.kind() == "element_value_pair" {
            let key = argument.child_by_field_name("key")?;
            if &source[key.start_byte()..key.end_byte()] == name {
                return argument.child_by_field_name("value");
            }
        } else if name == "value" && arguments.len() == 1 {
            return Some(*argument);
        }
    }
    None
}
