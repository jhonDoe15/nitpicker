//! Checkstyle VisibilityModifier with allowPublicFinalFields, plus nitpicker's two suppressions
//! (protected fields of @MappedSuperclass, package fields of Lombok @Value / @FieldDefaults(PRIVATE)).
use super::helpers::{
    annotation_names, declarators, has_modifier, in_interface_or_annotation, modifiers, report,
};
use crate::engine::source::{SourceFile, children, walk};
use crate::engine::{FileRule, finding::Finding};
use tree_sitter::Node;

pub struct VisibilityModifier;

const IGNORED: &[&str] = &[
    "org.junit.Rule",
    "org.junit.ClassRule",
    "com.google.common.annotations.VisibleForTesting",
];

fn imports(file: &SourceFile) -> Vec<String> {
    children(file.tree.root_node())
        .into_iter()
        .filter(|node| node.kind() == "import_declaration")
        .map(|node| {
            let star = children(node)
                .iter()
                .any(|child| child.kind() == "asterisk");
            let name = children(node)
                .into_iter()
                .find(|child| matches!(child.kind(), "scoped_identifier" | "identifier"))
                .map(|child| file.text_of(child).to_string())
                .unwrap_or_default();
            if star { format!("{name}.*") } else { name }
        })
        .collect()
}

fn ignore_annotated(file: &SourceFile, field: Node, imports: &[String]) -> bool {
    annotation_names(file, field).iter().any(|name| {
        IGNORED.iter().any(|canonical| {
            let (package, short) = canonical.rsplit_once('.').expect("canonical");
            name == canonical
                || (name == &short
                    && imports
                        .iter()
                        .any(|import| import == canonical || import == &format!("{package}.*")))
        })
    })
}

fn suppressed(file: &SourceFile, field: Node) -> bool {
    let Some(owner) = field.parent().and_then(|body| body.parent()) else {
        return false;
    };
    if owner.kind() != "class_declaration" {
        return false;
    }
    let short = |name: &str| name.rsplit('.').next().unwrap_or(name).to_string();
    let names: Vec<String> = annotation_names(file, owner)
        .iter()
        .map(|name| short(name))
        .collect();
    if has_modifier(field, "protected")
        && annotation_names(file, owner).contains(&"MappedSuperclass")
    {
        return true;
    }
    let open = ["public", "protected", "static"]
        .iter()
        .any(|keyword| has_modifier(field, keyword));
    if open {
        return false;
    }
    let private_defaults = modifiers(owner).is_some_and(|m| {
        children(m).into_iter().any(|annotation| {
            annotation.kind() == "annotation"
                && annotation
                    .child_by_field_name("name")
                    .is_some_and(|n| short(file.text_of(n)) == "FieldDefaults")
                && file.text_of(annotation).contains("PRIVATE")
        })
    });
    names.iter().any(|name| name == "Value") || private_defaults
}

impl FileRule for VisibilityModifier {
    fn id(&self) -> &'static str {
        "VisibilityModifier"
    }
    fn check(&self, file: &SourceFile, out: &mut Vec<Finding>) {
        let imports = imports(file);
        walk(file.tree.root_node(), |field| {
            if field.kind() != "field_declaration" || in_interface_or_annotation(field) {
                return;
            }
            if has_modifier(field, "private")
                || (has_modifier(field, "static") && has_modifier(field, "final"))
            {
                return;
            }
            let public = has_modifier(field, "public");
            if has_modifier(field, "final")
                || ignore_annotated(file, field, &imports)
                || suppressed(file, field)
            {
                return;
            }
            for declarator in declarators(field) {
                let Some(name) = declarator.child_by_field_name("name") else {
                    continue;
                };
                let text = file.text_of(name);
                if public && text == "serialVersionUID" {
                    continue;
                }
                let message = format!(
                    "Variable '{text}' must be private, with an accessor if callers need it. Use a record for plain data."
                );
                report(out, file, name, self.id(), message);
            }
        });
    }
}
