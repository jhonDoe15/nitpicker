//! `_JavacNames` lists the compiler-made names of a file so they can be compared with what `javac` wrote:
//! `class` for an anonymous class with its constructor, `local` for a local class, `lambda` for a lambda's
//! hidden method with its parameters, `reference` for a method reference compiled as a lambda, `serializable`
//! for a lambda whose name carries a hash. The line is where the code starts and the column where it ends.
use super::{Names, binary, spelled};
use crate::engine::source::SourceFile;
use crate::engine::{FileRule, Project, finding::Finding};
use crate::java::types::model::Type;
use crate::java::types::project::JavaProject;
use crate::java::types::scope::{FileScope, Resolver, TYPE_DECLARATIONS};

pub struct JavacNames;

impl FileRule for JavacNames {
    fn id(&self) -> &'static str {
        "_JavacNames"
    }
    fn needs_project(&self) -> bool {
        true
    }
    fn check(&self, _file: &SourceFile, _out: &mut Vec<Finding>) {}
    fn check_in(&self, file: &SourceFile, project: &Project, out: &mut Vec<Finding>) {
        let Some(project) = project.downcast_ref::<JavaProject>() else { return };
        let scope = &FileScope::of(file);
        let resolver = &Resolver::new(&project.index, file, scope);
        let _parents = crate::engine::source::ParentTable::of(file.tree.root_node());
        let names = Names::of(resolver, file.tree.root_node());
        let index = &project.index;
        let listed = |kinds: Vec<Option<Type>>| kinds.iter().map(|kind| kind.as_ref().map_or_else(|| "?".to_string(), |kind| spelled(index, kind))).collect::<Vec<_>>().join(",");
        crate::engine::source::walk(file.tree.root_node(), |node| {
            let mut add = |rule: &str, message: String| {
                let (line, last) = (node.start_position().row + 1, node.end_position().row + 1);
                out.push(Finding { file: file.path.clone(), line, column: last, rule: rule.to_string(), message, symbol: None });
            };
            if let Some(synthetic) = names.lambda(node) {
                let owner = binary(index, &synthetic.owner);
                match (&synthetic.name, node.kind()) {
                    (None, _) => add("serializable", owner),
                    (Some(name), "lambda_expression") => add("lambda", format!("{owner}.{name}({})", listed(names.lambda_parameters(resolver, node)))),
                    (Some(name), _) => add("reference", format!("{owner}.{name}")),
                }
            }
            let Some(class) = scope.names.get(&node.id()).filter(|class| names.locals.contains_key(*class)) else { return };
            if TYPE_DECLARATIONS.contains(&node.kind()) {
                add("local", binary(index, class));
            } else {
                add("class", format!("{}({})", binary(index, class), listed(names.anonymous_constructor(resolver, node))));
            }
        });
    }
}
