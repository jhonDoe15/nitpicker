//! PackageLocation: the package a file declares does not end the directory the file is in.
use super::Context;
use crate::engine::source::{children, named_children};
use tree_sitter::Node;

pub fn package_location(context: &Context, root: Node) {
    let Some(package) = children(root).into_iter().find(|part| part.kind() == "package_declaration") else { return };
    let Some(name) = named_children(package).into_iter().rev().find(|part| matches!(part.kind(), "scoped_identifier" | "identifier")) else { return };
    let suppressed = children(package).into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")).any(|annotation| {
        annotation.child_by_field_name("name").is_some_and(|written| context.resolver.class_name(package, context.text(written)).as_deref() == Some("com.google.errorprone.annotations.SuppressPackageLocation"))
    });
    if suppressed {
        return;
    }
    let declared: String = context.text(name).split_whitespace().collect();
    let path = context.file.path.replace('\\', "/");
    let Some((directory, _)) = path.rsplit_once('/') else { return };
    let actual: Vec<&str> = directory.split('/').collect();
    let expected: Vec<&str> = declared.split('.').collect();
    let suffix = &actual[actual.len().saturating_sub(expected.len())..];
    if suffix == expected.as_slice() {
        return;
    }
    let message = format!("Expected package {declared} to be declared in a directory ending with {}, instead found {}", expected.join("/"), suffix.join("/"));
    context.report_fixed("PackageLocation", package, super::junit_cleanups::type_position(name), &message, &[]);
}
