//! `no-dynamic-import-of-path`: `import(path)` of a file system path, which Windows reads as a URL with the drive
//! letter as its scheme.
use super::{PATH_CALLS, PATH_OBJECTS};
use crate::typescript::rules::Context;
use crate::typescript::rules::security_values::resolve_constant;
use crate::typescript::rules::signatures::{ASSERTION_FORMS, unwrap};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::{quasi_text, source, string_value};
use regex::Regex;
use std::collections::HashSet;
use std::sync::LazyLock;

const RULE: &str = "no-dynamic-import-of-path";
const MESSAGE: &str = "Import a filesystem path as a file URL: `await import(pathToFileURL(file).href)`. On Windows a drive letter reads as a URL scheme and the import fails with ERR_UNSUPPORTED_ESM_URL_SCHEME.";
const MAX_DEPTH: usize = 6;
const PATH_FUNCTIONS: [&str; 4] = ["resolve", "join", "normalize", "relative"];
const CURRENT_DIRECTORY_NAMES: [&str; 2] = ["__dirname", "__filename"];

struct Patterns {
    file_url_text: Regex,
    file_url_start: Regex,
    test_file: Regex,
    node_signal: Regex,
    url_text: Regex,
    path_name: Regex,
    path_module: Regex,
}

static PATTERNS: LazyLock<Patterns> = LazyLock::new(|| Patterns {
    file_url_text: Regex::new(r"pathToFileURL|file://").expect("pattern"),
    file_url_start: Regex::new(r"^file:").expect("pattern"),
    test_file: Regex::new(r"__test__|playground").expect("pattern"),
    node_signal: Regex::new(r#"node:(?:path|fs|url|module|os)|['"](?:path|fs|url)['"]|(?-u:\b)__dirname(?-u:\b)|process\.cwd"#).expect("pattern"),
    url_text: Regex::new(r"(?i)pathToFileURL|\.href|new URL|\.toString\(|url").expect("pattern"),
    path_name: Regex::new(r"(?:Path|File|Dir|Filepath|Filename)$").expect("pattern"),
    path_module: Regex::new(r"^(?:node:)?path(?:/posix|/win32)?$").expect("pattern"),
});

fn name(node: Option<Node>) -> String {
    node.and_then(|node| node.name()).map(|name| name.into_owned()).unwrap_or_default()
}

struct Walk<'c, 'a, 's> {
    scopes: &'c Scopes<'a, 's>,
    text: &'a str,
    imported: HashSet<String>,
}

fn is_current_directory(node: Node) -> bool {
    if node.is("Identifier") {
        return CURRENT_DIRECTORY_NAMES.contains(&name(Some(node)).as_str());
    }
    let property = name(node.node("property"));
    node.is("MemberExpression")
        && node.node("object").is_some_and(|object| object.is("MetaProperty"))
        && (property == "dirname" || property == "filename")
}

fn imported_path_functions(program: Node) -> HashSet<String> {
    let mut names = HashSet::new();
    for statement in program.nodes("body").into_iter().filter(|statement| statement.is("ImportDeclaration")) {
        let module = statement.node("source").and_then(|source| source.text("value")).unwrap_or_default();
        if !PATTERNS.path_module.is_match(&module) {
            continue;
        }
        for specifier in statement.nodes("specifiers").into_iter().filter(|specifier| specifier.is("ImportSpecifier")) {
            let imported = specifier.node("imported").and_then(|imported| imported.name());
            if imported.is_some_and(|imported| PATH_FUNCTIONS.contains(&&*imported)) {
                names.insert(name(specifier.node("local")));
            }
        }
    }
    names
}

impl<'s> Walk<'_, '_, 's> {
    fn is_path_call(&self, node: Node) -> bool {
        let Some(callee) = node.node("callee") else { return false };
        if callee.is("Identifier") {
            let called = name(Some(callee));
            return PATH_CALLS.contains(&called.as_str()) || called == "cwd" || self.imported.contains(&called);
        }
        if !callee.is("MemberExpression") || callee.flag("computed") {
            return false;
        }
        let method = name(callee.node("property"));
        let owner = callee.node("object");
        let owner_name = owner.map(|owner| if owner.is("MemberExpression") { name(owner.node("property")) } else { name(Some(owner)) });
        let owner_name = owner_name.unwrap_or_default();
        (PATH_FUNCTIONS.contains(&method.as_str()) && PATH_OBJECTS.contains(&owner_name.as_str()))
            || (method == "resolve" && owner_name == "require")
            || PATH_CALLS.contains(&method.as_str())
            || (method == "cwd" && owner_name == "process")
    }

    fn is_named_path_value(&self, value: Node) -> bool {
        let p = &*PATTERNS;
        !p.url_text.is_match(source(self.text, value))
            && string_value(Some(value)).is_none()
            && !p.file_url_text.is_match(self.text)
            && p.node_signal.is_match(self.text)
    }

    fn outcome(&self, node: Node<'s>, depth: usize, pending: &mut Vec<(Node<'s>, usize)>) -> bool {
        let written = unwrap(node, ASSERTION_FORMS);
        let value = unwrap(resolve_constant(self.scopes, Some(written)).unwrap_or(written), ASSERTION_FORMS);
        if written.is("Identifier") && PATTERNS.path_name.is_match(&name(Some(written))) {
            return self.is_named_path_value(value);
        }
        let deeper = |parts: Vec<Node<'s>>, pending: &mut Vec<(Node<'s>, usize)>| {
            if depth < MAX_DEPTH {
                pending.extend(parts.into_iter().map(|part| (part, depth + 1)));
            }
        };
        match value.kind() {
            "CallExpression" => self.is_path_call(value),
            "BinaryExpression" => {
                if value.text("operator").as_deref() == Some("+") {
                    deeper(value.node("left").into_iter().chain(value.node("right")).collect(), pending);
                }
                false
            }
            "TemplateLiteral" => {
                deeper(value.nodes("expressions"), pending);
                false
            }
            "Identifier" => CURRENT_DIRECTORY_NAMES.contains(&name(Some(value)).as_str()),
            _ => value.is("MemberExpression") && is_current_directory(value),
        }
    }

    fn is_path_value(&self, node: Node<'s>) -> bool {
        let mut pending = vec![(node, 0)];
        let mut index = 0;
        while index < pending.len() {
            let (current, depth) = pending[index];
            index += 1;
            if self.outcome(current, depth, &mut pending) {
                return true;
            }
        }
        false
    }
}

fn starts_as_file_url(node: Node) -> bool {
    node.is("TemplateLiteral") && PATTERNS.file_url_start.is_match(&quasi_text(node, 0))
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    if PATTERNS.test_file.is_match(context.file.path) {
        return;
    }
    let walk = Walk { scopes, text: context.file.text, imported: imported_path_functions(view.program()) };
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("ImportExpression")) {
        let Some(written) = node.node("source") else { continue };
        let source = unwrap(written, ASSERTION_FORMS);
        if string_value(resolve_constant(scopes, Some(source))).is_some() || starts_as_file_url(source) {
            continue;
        }
        if walk.is_path_value(source) {
            found.push(written);
        }
    }
    for node in found {
        context.report_range(RULE, node.start(), Some(node.end()), MESSAGE.to_string());
    }
}
