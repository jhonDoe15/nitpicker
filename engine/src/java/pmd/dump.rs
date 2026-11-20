//! Writes the PMD-shaped tree of every file as text, to compare it with a dump made by PMD itself.
use super::tree::{PmdTree, ROOT, Value};
use super::xpath::eval::Machine;
use crate::engine::source::SourceFile;
use crate::engine::{FileRule, Project, finding::Finding};
use crate::java::types::model::Type;
use crate::java::types::project::JavaProject;
use crate::java::types::scope::Resolver;
use std::fmt::Write;

pub struct TreeDump;

fn shown(value: &Value) -> String {
    match value {
        Value::Text(text) => text
            .replace('\\', "\\\\")
            .replace('\n', "\\n")
            .replace('\r', "\\r"),
        Value::Flag(flag) => flag.to_string(),
        Value::Whole(whole) => whole.to_string(),
        Value::Real(real) => super::tree::java_double(*real),
        Value::List(items) => format!("[{}]", items.join(", ")),
    }
}

fn type_text(kind: &Type) -> String {
    match kind {
        Type::Null => "?null".to_string(),
        Type::Array(element) => format!("{}[]", type_text(element)),
        other => other
            .erased()
            .name()
            .split('&')
            .next()
            .unwrap_or_default()
            .to_string(),
    }
}

fn write_node(
    tree: &PmdTree,
    file: &SourceFile,
    id: u32,
    depth: usize,
    machine: Option<&Machine>,
    out: &mut String,
) {
    let node = &tree.nodes[id as usize];
    let mut names = tree.attribute_names(id);
    names.sort_unstable();
    names.dedup();
    let _ = write!(out, "{}{}", " ".repeat(depth), node.name);
    for name in names {
        if let Some(value) = tree.attribute(file, id, name) {
            let _ = write!(out, " {name}={}\u{1}", shown(&value));
        }
    }
    if let Some(machine) = machine {
        if matches!(node.name, "MethodCall" | "ConstructorCall") {
            let written = machine.call_facts(id).map_or("!".to_string(), |call| {
                let formals: Vec<String> = call.formals.iter().map(type_text).collect();
                format!(
                    "{}{}{}({})",
                    type_text(&call.qualifier),
                    if call.exact { "=" } else { "<" },
                    call.name,
                    formals.join(",")
                )
            });
            let _ = write!(out, " Sig={written}\u{1}");
        }
        if let Some(kind) = machine.node_type(id) {
            let _ = write!(out, " Ty={}\u{1}", type_text(&kind));
        }
    }
    out.push('\n');
    for kid in &node.children {
        write_node(tree, file, *kid, depth + 1, machine, out);
    }
}

impl FileRule for TreeDump {
    fn id(&self) -> &'static str {
        "_PmdTree"
    }
    fn needs_project(&self) -> bool {
        true
    }
    fn check(&self, _file: &SourceFile, _out: &mut Vec<Finding>) {}
    fn check_in(&self, file: &SourceFile, project: &Project, _out: &mut Vec<Finding>) {
        let Some(project) = project.downcast_ref::<JavaProject>() else {
            return;
        };
        let scope = &crate::java::types::scope::FileScope::of(file);
        let Ok(target) = std::env::var("NP_TREE_OUT") else {
            return;
        };
        if std::env::var("NP_SEXP").is_ok() {
            eprintln!("{}", file.tree.root_node().to_sexp());
        }
        let resolver = Resolver::new(&project.index, file, scope);
        let tree = PmdTree::build(file, file.tree.root_node(), &resolver);
        let machine = Machine::new(&tree, file, &resolver);
        let typed = std::env::var("NP_TYPES").is_ok();
        let mut out = String::new();
        for (id, node) in tree.nodes.iter().enumerate() {
            if node.parent == ROOT {
                write_node(
                    &tree,
                    file,
                    id as u32,
                    0,
                    typed.then_some(&machine),
                    &mut out,
                );
            }
        }
        let name = format!("{}.txt", file.path.replace('/', "_"));
        let _ = std::fs::write(std::path::Path::new(&target).join(name), out);
    }
}
