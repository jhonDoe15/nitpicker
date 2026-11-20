//! Numbers for local and anonymous classes (`Outer$1`, `Outer$1Local`), in the order the compiler gives them.
use crate::engine::source::{SourceFile, children};
use crate::java::types::scope::TYPE_DECLARATIONS;
use std::collections::HashMap;
use tree_sitter::Node;

/// Fills `names` with the name of every class written in the file, by node.
pub fn number(file: &SourceFile, package: &str, names: &mut HashMap<usize, String>) {
    ClassNamer { file, counters: HashMap::new(), names }.inside(file.tree.root_node(), package, true);
}

const MEMBER_HOLDERS: &[&str] =
    &["program", "class_body", "interface_body", "enum_body", "enum_body_declarations", "annotation_type_body"];

/// Arguments the compiler looks at only after the plain ones of the same call: their meaning depends on the
/// method that gets chosen.
fn decided_late(file: &SourceFile, argument: Node) -> bool {
    match argument.kind() {
        "lambda_expression" | "parenthesized_expression" | "ternary_expression" | "switch_expression" => true,
        "method_invocation" => argument.child_by_field_name("type_arguments").is_none(),
        "object_creation_expression" => diamond(file, argument),
        _ => false,
    }
}

fn diamond(file: &SourceFile, creation: Node) -> bool {
    let written = creation.child_by_field_name("type").filter(|written| written.kind() == "generic_type");
    written.is_some_and(|written| children(written).into_iter().any(|part| part.kind() == "type_arguments" && part.named_child_count() == 0 && file.text_of(part).starts_with('<')))
}

/// Numbers local and anonymous classes in the order the compiler meets them, which decides `Outer$1`, `Outer$2`.
/// Inside a call that is source order, except that the arguments in `decided_late` come after the others, and
/// that an anonymous class gets its number between the two groups, or after both when it is written with `<>`.
struct ClassNamer<'f, 'n> {
    file: &'f SourceFile,
    counters: HashMap<(String, String), u32>,
    names: &'n mut HashMap<usize, String>,
}

impl ClassNamer<'_, '_> {
    fn local(&mut self, enclosing: &str, simple: &str) -> String {
        let count = self.counters.entry((enclosing.to_string(), simple.to_string())).or_insert(0);
        *count += 1;
        format!("{enclosing}.{count}{simple}")
    }

    fn inside(&mut self, node: Node, enclosing: &str, top: bool) {
        for child in children(node) {
            self.visit(node, child, enclosing, top);
        }
    }

    /// An anonymous class written with `<>` as an argument gets its number last: its type is only known once
    /// the whole call is.
    fn arguments(&mut self, list: Node, late: bool, enclosing: &str, top: bool) {
        let mut last = Vec::new();
        for argument in children(list) {
            if decided_late(self.file, argument) != late {
                continue;
            }
            let parts = children(argument);
            if late && argument.kind() == "object_creation_expression" && parts.iter().any(|part| part.kind() == "class_body") {
                for part in parts.iter().filter(|part| part.kind() != "class_body") {
                    self.visit(argument, *part, enclosing, top);
                }
                last.push((argument, parts));
            } else {
                self.visit(list, argument, enclosing, top);
            }
        }
        for (creation, parts) in last {
            self.anonymous(creation, &parts, enclosing);
        }
    }

    fn anonymous(&mut self, creation: Node, parts: &[Node], enclosing: &str) {
        let name = self.local(enclosing, "");
        self.names.insert(creation.id(), name.clone());
        for body in parts.iter().filter(|part| part.kind() == "class_body") {
            self.inside(*body, &name, false);
        }
    }

    fn visit(&mut self, holder: Node, child: Node, enclosing: &str, top: bool) {
        let kind = child.kind();
        if TYPE_DECLARATIONS.contains(&kind) {
            let simple = child.child_by_field_name("name").map(|name| self.file.text_of(name)).unwrap_or_default();
            let name = if !MEMBER_HOLDERS.contains(&holder.kind()) {
                self.local(enclosing, simple)
            } else if top && enclosing.is_empty() {
                simple.to_string()
            } else {
                format!("{enclosing}.{simple}")
            };
            self.names.insert(child.id(), name.clone());
            self.inside(child, &name, false);
        } else if matches!(kind, "object_creation_expression" | "enum_constant")
            && children(child).iter().any(|part| part.kind() == "class_body")
        {
            let parts = children(child);
            let list = parts.iter().copied().find(|part| part.kind() == "argument_list");
            for part in parts.iter().filter(|part| !matches!(part.kind(), "argument_list" | "class_body")) {
                self.visit(child, *part, enclosing, top);
            }
            let inferred = kind == "object_creation_expression" && diamond(self.file, child);
            for late in [false, true] {
                if late && !inferred {
                    self.anonymous(child, &parts, enclosing);
                }
                if let Some(list) = list {
                    self.arguments(list, late, enclosing, top);
                }
            }
            if inferred {
                self.anonymous(child, &parts, enclosing);
            }
        } else if kind == "argument_list" {
            self.arguments(child, false, enclosing, top);
            self.arguments(child, true, enclosing, top);
        } else {
            self.inside(child, enclosing, top);
        }
    }
}
