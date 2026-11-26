use super::names::record_components;
use crate::engine::source::{SourceFile, children};
use crate::java::checkstyle::report::Report;
use crate::java::helpers::annotation_names;
use tree_sitter::Node;

const TYPES: &[&str] = &[
    "class_declaration",
    "interface_declaration",
    "enum_declaration",
    "annotation_type_declaration",
    "record_declaration",
];

pub fn outer_type(file: &SourceFile, report: &mut Report) {
    let types: Vec<Node> = children(file.tree.root_node())
        .into_iter()
        .filter(|part| TYPES.contains(&part.kind()))
        .collect();
    let public = |declaration: &&Node| {
        children(**declaration).into_iter().any(|part| {
            part.kind() == "modifiers"
                && children(part)
                    .iter()
                    .any(|modifier| modifier.kind() == "public")
        })
    };
    let Some(checked) = types.iter().find(public).or(types.first()) else {
        return;
    };
    let name = checked
        .child_by_field_name("name")
        .map(|name| file.text_of(name))
        .unwrap_or_default();
    let stem = std::path::Path::new(&file.path)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or_default();
    if name != stem {
        let source = "com.puppycrawl.tools.checkstyle.checks.OuterTypeFilenameCheck";
        report.node(
            *checked,
            source,
            "The name of the outer type and the file do not match.".to_string(),
        );
    }
}

pub fn record_accessors(file: &SourceFile, node: Node, report: &mut Report) {
    if node.kind() != "record_declaration" {
        return;
    }
    let components: Vec<&str> = record_components(node)
        .into_iter()
        .map(|name| file.text_of(name))
        .collect();
    let Some(body) = node.child_by_field_name("body") else {
        return;
    };
    for method in children(body)
        .into_iter()
        .filter(|part| part.kind() == "method_declaration")
    {
        let name = method
            .child_by_field_name("name")
            .map(|name| file.text_of(name))
            .unwrap_or_default();
        let empty = method
            .child_by_field_name("parameters")
            .is_some_and(|list| list.named_child_count() == 0);
        let marked = annotation_names(file, method)
            .iter()
            .any(|name| matches!(*name, "Override" | "java.lang.Override"));
        if empty && !marked && components.contains(&name) {
            let source = "com.puppycrawl.tools.checkstyle.checks.annotation.MissingOverrideOnRecordAccessorCheck";
            let message =
                "Record component accessor method must include @java.lang.Override annotation."
                    .to_string();
            report.node(method, source, message);
        }
    }
}
