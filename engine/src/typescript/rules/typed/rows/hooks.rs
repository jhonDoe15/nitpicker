//! `hookStatus`: whether the class of a query's rows has hooks, subscribers, a version column or a cascade that a
//! bulk statement would skip, from the class, its base class and a scan of the program's own files.
use crate::typescript::rules::effects::flow::is_function_like;
use crate::typescript::rules::typed::types::{Types, is_declaration_file};
use crate::typescript::rules::typed::versions::trees::{decorator_name, decorators};
use crate::typescript::types::nodes::NodeTable;
use crate::typescript::types::tables::kind as k;
use regex::Regex;
use std::collections::HashSet;
use std::sync::LazyLock;

const VERSION_NAMES: [&str; 3] = ["VersionColumn", "Version", "VersionAttribute"];
const SUBSCRIBERS: [&str; 2] = ["EventSubscriber", "EntitySubscriberInterface"];
const SUBSCRIBED: [&str; 2] = ["listenTo", "getSubscribedEntities"];
const CASCADE_OPTIONS: [&str; 3] = ["cascade", "orphanRemoval", "orphanedRowAction"];
const CODE: [&str; 8] = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
static HOOK_NAME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?:Before|After)(?:Insert|Update|Remove|SoftRemove|Recover|Create|Delete|Destroy|Save|Upsert|Bulk[A-Za-z0-9_]*)$").expect("pattern")
});
static HOOK_METHODS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(?:addHook|before[A-Za-z0-9_]+|after[A-Za-z0-9_]+)$").expect("pattern"));
static HINT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"EventSubscriber|EntitySubscriberInterface|addHook|\.(?:before|after)[A-Z]|hooks[\t\n\x0B\x0C\r\p{Z}\x{FEFF}]*:|version[\t\n\x0B\x0C\r\p{Z}\x{FEFF}]*:")
        .expect("pattern")
});
static CONFIGURED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"hooks|version").expect("pattern"));

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum HookStatus {
    Unknown,
    Plain,
    Hooked,
    Clean,
}

/// The names of the classes some file of the program hooks or subscribes to, or `global` for a subscriber of
/// every entity; kept for the run once it is known.
#[derive(Default)]
pub struct HookIndex(Option<(HashSet<String>, bool)>);

fn is_option_hooked(table: &NodeTable, property: u32) -> bool {
    if table.kind(property) != k::PROPERTY_ASSIGNMENT {
        return false;
    }
    let name = table.child(property, "name").map(|name| table.node_text(name).to_string()).unwrap_or_default();
    let value = table.child(property, "initializer").map(|value| table.kind(value));
    (name == "version" && value == Some(k::TRUE_KEYWORD)) || (CASCADE_OPTIONS.contains(&name.as_str()) && value != Some(k::FALSE_KEYWORD))
}

fn declares_version(table: &NodeTable, decorator: u32) -> bool {
    let Some(expression) = table.child(decorator, "expression").filter(|expression| table.kind(*expression) == k::CALL_EXPRESSION) else { return false };
    table.listed(expression, "arguments").into_iter().any(|argument| {
        table.kind(argument) == k::OBJECT_LITERAL_EXPRESSION && table.listed(argument, "properties").into_iter().any(|property| is_option_hooked(table, property))
    })
}

fn is_hook_decorator(table: &NodeTable, decorator: u32) -> bool {
    decorator_name(table, decorator).is_some_and(|name| HOOK_NAME.is_match(&name) || VERSION_NAMES.contains(&name.as_str()) || declares_version(table, decorator))
}

fn class_has_hooked_member(table: &NodeTable, class: u32) -> bool {
    table.listed(class, "members").into_iter().any(|member| decorators(table, member).into_iter().any(|decorator| is_hook_decorator(table, decorator)))
}

fn returned_names(table: &NodeTable, method: u32, names: &mut Vec<String>) {
    let mut pending = vec![method];
    while let Some(node) = pending.pop() {
        if table.kind(node) == k::RETURN_STATEMENT
            && let Some(value) = table.child(node, "expression")
        {
            let items = if table.kind(value) == k::ARRAY_LITERAL_EXPRESSION { table.listed(value, "elements") } else { vec![value] };
            names.extend(items.into_iter().filter(|item| table.kind(*item) == k::IDENTIFIER).filter_map(|item| table.text(item).map(|text| text.into_owned())));
        }
        if !is_function_like(table.kind(node)) || node == method {
            pending.extend(table.children(node));
        }
    }
}

fn is_subscriber(table: &NodeTable, class: u32) -> bool {
    let decorated = decorators(table, class).into_iter().any(|decorator| decorator_name(table, decorator).is_some_and(|name| SUBSCRIBERS.contains(&name.as_str())));
    let implemented = table.listed(class, "heritageClauses").into_iter().any(|clause| {
        table.listed(clause, "types").into_iter().any(|kind| table.child(kind, "expression").is_some_and(|expression| SUBSCRIBERS.contains(&table.node_text(expression))))
    });
    decorated || implemented
}

fn note_subscriber(table: &NodeTable, class: u32, names: &mut HashSet<String>, global: &mut bool) {
    let methods = table.listed(class, "members").into_iter().filter(|member| table.kind(*member) == k::METHOD_DECLARATION);
    let lookup = methods.into_iter().find(|member| table.child(*member, "name").is_some_and(|name| SUBSCRIBED.contains(&table.node_text(name))));
    let mut found = Vec::new();
    if let Some(lookup) = lookup {
        returned_names(table, lookup, &mut found);
    }
    if found.is_empty() {
        *global = true;
    }
    names.extend(found);
}

fn note_call(table: &NodeTable, call: u32, names: &mut HashSet<String>) {
    let Some(callee) = table.child(call, "expression").filter(|callee| table.kind(*callee) == k::PROPERTY_ACCESS_EXPRESSION) else { return };
    let Some(owner) = table.child(callee, "expression").filter(|owner| table.kind(*owner) == k::IDENTIFIER) else { return };
    let method = table.child(callee, "name").and_then(|name| table.text(name)).map(|text| text.into_owned()).unwrap_or_default();
    let configured = method == "init"
        && table.listed(call, "arguments").into_iter().any(|argument| table.kind(argument) == k::OBJECT_LITERAL_EXPRESSION && CONFIGURED.is_match(table.node_text(argument)));
    if HOOK_METHODS.is_match(&method) || configured {
        names.extend(table.text(owner).map(|text| text.into_owned()));
    }
}

fn scan(table: &NodeTable, names: &mut HashSet<String>, global: &mut bool) {
    let mut pending = vec![1];
    while let Some(node) = pending.pop() {
        match table.kind(node) {
            k::CLASS_DECLARATION if is_subscriber(table, node) => note_subscriber(table, node, names, global),
            k::CALL_EXPRESSION => note_call(table, node, names),
            _ => {}
        }
        pending.extend(table.children(node));
    }
}

impl Types {
    fn hook_index(&mut self, index: &mut HookIndex) -> Option<(HashSet<String>, bool)> {
        if let Some(known) = &index.0 {
            return Some(known.clone());
        }
        let (mut names, mut global) = (HashSet::new(), false);
        for file in self.program_files() {
            if is_declaration_file(&file) || file.contains("/node_modules/") || !CODE.iter().any(|extension| file.ends_with(extension)) {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(&file) else { continue };
            if !HINT.is_match(&text) {
                continue;
            }
            let table = self.table_of(&file)?;
            scan(&table, &mut names, &mut global);
        }
        index.0 = Some((names, global));
        index.0.clone()
    }

    fn class_hooked(&mut self, class: &str) -> bool {
        let chain = std::iter::once(class.to_string()).chain(self.entity_base(class));
        for each in chain.collect::<Vec<_>>() {
            let Some((table, index, _)) = self.entity_tree(&each) else { return false };
            if class_has_hooked_member(&table, index) {
                return true;
            }
        }
        false
    }

    /// `hookStatus` of the rows an awaited query loads.
    pub fn hook_status(&mut self, start: u32, end: u32, index: &mut HookIndex) -> HookStatus {
        let Some(element) = self.row_element(start, end) else { return HookStatus::Unknown };
        let Some(class) = self.entity_class_of(&element) else { return HookStatus::Plain };
        let Some((names, global)) = self.hook_index(index) else { return HookStatus::Unknown };
        let named = self.entity_tree(&class).and_then(|(table, at, _)| table.child(at, "name").and_then(|name| table.text(name)).map(|text| text.into_owned()));
        let hooked = global || named.is_some_and(|name| names.contains(&name)) || self.class_hooked(&class);
        if hooked { HookStatus::Hooked } else { HookStatus::Clean }
    }
}
