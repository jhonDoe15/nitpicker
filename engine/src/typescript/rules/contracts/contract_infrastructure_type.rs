//! `contract-infrastructure-type`: the index of a feature exports a persistence handle or a request or response
//! object in a signature. Each leak is reported at the statement that exports the name, or at the first
//! `export *` that has it, or at the program.
use super::infrastructure::{Infrastructure, interpolate};
use super::members::{Leak, export_leaks};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use crate::typescript::types::server::Symbol;
use crate::typescript::rules::typed::types::Types;
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

const RULE: &str = "contract-infrastructure-type";
const FEATURE: &str = "contract-infrastructure-type.feature";

const PERSISTENCE: &str = "Take a repository or a port interface and return a domain type or a plain record from {{member}}: {{type}} from {{package}} is a persistence handle, so every importer of feature {{feature}} depends on its database session. Keep {{type}} in the feature's adapters behind the index; a factory (a function that returns an object synchronously) that receives it from the composition root is fine. An exception fits only when the feature deliberately hands out the handle, such as a shared transaction helper.";
const TRANSPORT: &str = "Take plain values and return a domain type or a plain record from {{member}}: {{type}} from {{package}} is a request or response object, so every importer of feature {{feature}} needs a live HTTP exchange. Read it in the route handler and pass the values in. An exception fits only when the export is a route handler or middleware the framework calls with a different first parameter.";

fn name_of(node: Node) -> Option<String> {
    if node.is("Identifier") { node.name().map(|name| name.into_owned()) } else { node.text("value").map(|value| value.into_owned()) }
}

fn declared_names(declaration: Node) -> Vec<String> {
    match declaration.kind() {
        "FunctionDeclaration" | "ClassDeclaration" | "TSInterfaceDeclaration" | "TSTypeAliasDeclaration" | "TSDeclareFunction" => {
            declaration.node("id").and_then(|id| id.name()).map(|name| name.into_owned()).into_iter().collect()
        }
        "VariableDeclaration" => declaration
            .nodes("declarations")
            .into_iter()
            .filter_map(|declarator| declarator.node("id").filter(|id| id.is("Identifier")).and_then(|id| id.name()).map(|name| name.into_owned()))
            .collect(),
        _ => Vec::new(),
    }
}

fn named_exports(statement: Node) -> Vec<String> {
    match statement.kind() {
        "ExportNamedDeclaration" => {
            let mut names: Vec<String> = statement.nodes("specifiers").into_iter().filter_map(|specifier| specifier.node("exported").and_then(name_of)).collect();
            names.extend(statement.node("declaration").map(declared_names).unwrap_or_default());
            names
        }
        "ExportAllDeclaration" => statement.node("exported").and_then(name_of).into_iter().collect(),
        "ExportDefaultDeclaration" => vec!["default".to_string()],
        _ => Vec::new(),
    }
}

struct Anchors<'v> {
    named: HashMap<String, Node<'v>>,
    stars: Vec<(Node<'v>, HashSet<String>)>,
    program: Node<'v>,
    program_start: u32,
}

impl<'v> Anchors<'v> {
    fn of(types: &RefCell<Types>, program: Node<'v>) -> Anchors<'v> {
        let mut named = HashMap::new();
        let mut stars = Vec::new();
        for statement in program.nodes("body") {
            for name in named_exports(statement) {
                named.insert(name, statement);
            }
            if let Some(source) = statement.node("source").filter(|_| statement.is("ExportAllDeclaration") && statement.node("exported").is_none()) {
                let mut types = types.borrow_mut();
                let target = types.module_of_specifier(source.start(), source.end());
                let names = target.map(|target| types.module_exports(&target)).unwrap_or_default();
                stars.push((statement, names.iter().map(|symbol| symbol.name.clone()).collect()));
            }
        }
        let program_start = program.nodes("body").iter().map(|statement| statement.start()).min().unwrap_or(program.start());
        Anchors { named, stars, program, program_start }
    }

    /// Where the anchor of an exported name starts and ends: the program starts at its first statement, as the
    /// ESTree of the plugin's parser counts it.
    fn place_of(&self, name: &str) -> (u32, u32) {
        let statement = self.named.get(name).copied().or_else(|| self.stars.iter().find(|(_, names)| names.contains(name)).map(|(statement, _)| *statement));
        statement.map_or((self.program_start, self.program.end()), |statement| (statement.start(), statement.end()))
    }
}

fn message(found: &Infrastructure, member: &str, feature: &str) -> String {
    let template = if found.message_id() == "persistence" { PERSISTENCE } else { TRANSPORT };
    interpolate(template, &[("member", member), ("type", &found.name), ("package", &found.package), ("feature", feature)])
}

fn leaks_of(context: &Context, module: &Symbol) -> Option<Vec<(Leak, String)>> {
    let mut types = context.types?.borrow_mut();
    let mut seen = HashSet::new();
    let mut leaks = Vec::new();
    for exported in types.module_exports(module) {
        for leak in export_leaks(&mut types, &exported) {
            if seen.insert(format!("{}|{}|{}", leak.member, leak.found.package, leak.found.name)) {
                leaks.push((leak, exported.name.clone()));
            }
        }
    }
    (types.refused.is_none()).then_some(leaks)
}

pub fn check(context: &mut Context) {
    let (Some((view, _)), Some(types)) = (context.estree, context.types) else { return };
    let feature = context.setting(FEATURE).unwrap_or_default().to_string();
    if feature.is_empty() {
        return;
    }
    let Some(module) = types.borrow_mut().file_symbol() else { return };
    let program = view.program();
    let anchors = Anchors::of(types, program);
    let Some(leaks) = leaks_of(context, &module) else { return };
    for (Leak { member, found }, exported) in leaks {
        let (start, end) = anchors.place_of(&exported);
        context.report_range(RULE, start, Some(end), message(&found, &member, &feature));
    }
}
