//! Module resolution as the TypeScript compiler does it for a bundler, the modules a file names, and a bounded walk
//! over the files reachable from one. Shared by every check that follows imports.
use oxc_ast::ast::{Argument, CallExpression, ExportAllDeclaration, ExportFromDeclaration, Expression};
use oxc_ast::ast::{ImportDeclaration, ImportExpression, TSImportEqualsDeclaration, TSModuleReference, TemplateLiteral};
use oxc_ast_visit::{Visit, walk};
use oxc_resolver::{ResolveOptions, Resolver, TsConfig, TsconfigDiscovery, TsconfigOptions, TsconfigReferences};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

const CONFIG_NAMES: [&str; 2] = ["tsconfig.json", "jsconfig.json"];

const BUILTINS: &[&str] = &[
    "assert", "async_hooks", "buffer", "child_process", "cluster", "console", "constants", "crypto", "dgram",
    "diagnostics_channel", "dns", "domain", "events", "fs", "http", "http2", "https", "inspector", "module", "net", "os",
    "path", "perf_hooks", "process", "punycode", "querystring", "readline", "repl", "stream", "string_decoder", "sys",
    "timers", "tls", "trace_events", "tty", "url", "util", "v8", "vm", "wasi", "worker_threads", "zlib",
];

/// How modules resolve for the files under one `tsconfig.json` or `jsconfig.json`.
struct Project {
    resolver: Resolver,
    /// The same resolution without the path mapping.
    unmapped: Resolver,
    mapping: Option<Arc<TsConfig>>,
    patterns: Vec<String>,
    base_url: bool,
}

pub struct Modules {
    plain: Resolver,
    unmapped: Mutex<HashMap<Vec<String>, Resolver>>,
    nearest: Mutex<HashMap<PathBuf, Arc<Project>>>,
    sources: Mutex<HashMap<PathBuf, Arc<Vec<String>>>>,
}

/// How far `Modules::reaches` follows imports.
#[derive(Clone, Copy)]
pub struct Limits {
    pub depth: usize,
    pub files: usize,
}

fn options(conditions: &[String]) -> ResolveOptions {
    let condition_names = std::iter::once("import".to_string()).chain(conditions.iter().cloned()).collect();
    ResolveOptions { condition_names, ..ResolveOptions::default() }
}

/// `compilerOptions.customConditions` of a config, its own or else inherited; the resolver's config does not keep them.
fn custom_conditions(file: &Path, hops: usize) -> Option<Vec<String>> {
    let mut text = std::fs::read_to_string(file).ok()?;
    json_strip_comments::strip(&mut text).ok()?;
    let config: serde_json::Value = serde_json::from_str(&text).ok()?;
    if let Some(own) = config.pointer("/compilerOptions/customConditions").and_then(|own| own.as_array()) {
        return Some(own.iter().filter_map(|condition| condition.as_str().map(String::from)).collect());
    }
    let extended = match config.get("extends") {
        Some(serde_json::Value::String(one)) => vec![one.clone()],
        Some(serde_json::Value::Array(many)) => many.iter().filter_map(|one| one.as_str().map(String::from)).collect(),
        _ => Vec::new(),
    };
    extended.iter().rev().filter(|base| base.starts_with('.') && hops > 0).find_map(|base| {
        let target = file.parent()?.join(base);
        let target = if target.is_file() || base.ends_with(".json") { target } else { PathBuf::from(format!("{}.json", target.display())) };
        custom_conditions(&target, hops - 1)
    })
}

fn is_mapped(config: &TsConfig) -> bool {
    config.compiler_options.paths.is_some() || config.compiler_options.base_url.is_some()
}

fn pattern_matches(pattern: &str, specifier: &str) -> bool {
    match pattern.split_once('*') {
        None => specifier == pattern,
        Some(("", "")) => false,
        Some((prefix, suffix)) => {
            specifier.len() >= pattern.len() - 1 && specifier.starts_with(prefix) && specifier.ends_with(suffix)
        }
    }
}

fn is_word(character: char) -> bool {
    character.is_ascii_alphanumeric() || matches!(character, '_' | '.' | '-')
}

fn is_package_specifier(specifier: &str) -> bool {
    let unscoped = match specifier.strip_prefix('@') {
        Some(rest) => match rest.split_once('/') {
            Some((scope, name)) if !scope.is_empty() && scope.chars().all(is_word) => name,
            _ => return false,
        },
        None => specifier,
    };
    let name = unscoped.split('/').next().unwrap_or_default();
    let first = specifier.split('/').next().unwrap_or_default();
    !name.is_empty() && name.chars().all(is_word) && !specifier.starts_with("node:") && !BUILTINS.contains(&first)
}

fn is_declaration(file: &Path) -> bool {
    let name = file.to_string_lossy();
    [".d.ts", ".d.mts", ".d.cts"].iter().any(|ending| name.ends_with(ending))
}

fn is_installed(file: &Path) -> bool {
    file.components().any(|part| part.as_os_str() == "node_modules")
}

/// A JSON file imported by its full name, which the compiler resolves when JSON modules are on.
fn json_file(target: &Path) -> Option<PathBuf> {
    (target.extension().is_some_and(|extension| extension == "json") && target.is_file()).then(|| target.canonicalize().ok()).flatten()
}

impl Project {
    fn mapped_json(&self, specifier: &str) -> Option<PathBuf> {
        self.mapping.as_ref()?.resolve_path_alias_or_base_url(specifier).iter().find_map(|target| json_file(target))
    }
}

struct Named(Vec<String>);

impl Named {
    fn text(&mut self, template: &TemplateLiteral) {
        if let ([only], []) = (template.quasis.as_slice(), template.expressions.as_slice()) {
            self.0.extend(only.value.cooked.and_then(|cooked| cooked.as_str()).map(String::from));
        }
    }
}

impl<'a> Visit<'a> for Named {
    fn visit_import_declaration(&mut self, it: &ImportDeclaration<'a>) {
        self.0.extend(it.source.value.as_str().map(String::from));
        walk::walk_import_declaration(self, it);
    }

    fn visit_export_from_declaration(&mut self, it: &ExportFromDeclaration<'a>) {
        self.0.extend(it.source.value.as_str().map(String::from));
        walk::walk_export_from_declaration(self, it);
    }

    fn visit_export_all_declaration(&mut self, it: &ExportAllDeclaration<'a>) {
        self.0.extend(it.source.value.as_str().map(String::from));
        walk::walk_export_all_declaration(self, it);
    }

    fn visit_ts_import_equals_declaration(&mut self, it: &TSImportEqualsDeclaration<'a>) {
        if let TSModuleReference::ExternalModuleReference(reference) = &it.module_reference {
            self.0.extend(reference.expression.value.as_str().map(String::from));
        }
        walk::walk_ts_import_equals_declaration(self, it);
    }

    fn visit_import_expression(&mut self, it: &ImportExpression<'a>) {
        match &it.source {
            Expression::StringLiteral(literal) => self.0.extend(literal.value.as_str().map(String::from)),
            Expression::TemplateLiteral(template) => self.text(template),
            _ => {}
        }
        walk::walk_import_expression(self, it);
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if matches!(&it.callee, Expression::Identifier(callee) if callee.name == "require") {
            match it.arguments.first() {
                Some(Argument::StringLiteral(literal)) => self.0.extend(literal.value.as_str().map(String::from)),
                Some(Argument::TemplateLiteral(template)) => self.text(template),
                _ => {}
            }
        }
        walk::walk_call_expression(self, it);
    }
}

fn scanned(file: &Path) -> Vec<String> {
    let path = file.to_string_lossy();
    let known = file.extension().and_then(|extension| extension.to_str()).is_some_and(|extension| super::EXTENSIONS.contains(&extension));
    let Some(text) = known.then(|| std::fs::read_to_string(file).ok()).flatten() else { return Vec::new() };
    super::with_parsed(&path, &text, |parsed| {
        let mut named = Named(Vec::new());
        if !parsed.panicked {
            named.visit_program(parsed.program);
        }
        named.0
    })
}

impl Modules {
    /// The one instance of a run, so that every file shares what was resolved and read.
    pub fn shared() -> &'static Modules {
        static SHARED: OnceLock<Modules> = OnceLock::new();
        SHARED.get_or_init(|| Modules {
            plain: Resolver::new(options(&[])),
            unmapped: Mutex::new(HashMap::new()),
            nearest: Mutex::new(HashMap::new()),
            sources: Mutex::new(HashMap::new()),
        })
    }

    /// The config whose path mapping applies: the file's own, or else the first one it references that has a mapping.
    fn mapping(&self, file: &Path) -> Option<(PathBuf, Arc<TsConfig>)> {
        let own = self.plain.resolve_tsconfig(file).ok()?;
        if is_mapped(&own) {
            return Some((file.to_path_buf(), own));
        }
        let directory = file.parent()?;
        own.references.iter().find_map(|reference| {
            let target = directory.join(&reference.path);
            let target = if target.extension().is_some_and(|extension| extension == "json") { target } else { target.join(CONFIG_NAMES[0]) };
            let config = target.exists().then(|| self.plain.resolve_tsconfig(&target).ok()).flatten()?;
            is_mapped(&config).then_some((target, config))
        })
    }

    fn without_mapping(&self, conditions: &[String]) -> Resolver {
        let mut known = self.unmapped.lock().expect("lock");
        known.entry(conditions.to_vec()).or_insert_with(|| Resolver::new(options(conditions))).clone_with_options(options(conditions))
    }

    /// A resolver of its own for each mapped config: resolvers that share a cache also share the config they loaded.
    fn project(&self, file: Option<&Path>) -> Arc<Project> {
        let conditions = file.and_then(|file| custom_conditions(file, 8)).unwrap_or_default();
        let unmapped = self.without_mapping(&conditions);
        let Some((config_file, config)) = file.and_then(|file| self.mapping(file)) else {
            let resolver = unmapped.clone_with_options(options(&conditions));
            return Arc::new(Project { resolver, unmapped, mapping: None, patterns: Vec::new(), base_url: false });
        };
        let tsconfig = TsconfigOptions { config_file, references: TsconfigReferences::Disabled };
        let resolver = Resolver::new(ResolveOptions { tsconfig: Some(TsconfigDiscovery::Manual(tsconfig)), ..options(&conditions) });
        let patterns = config.compiler_options.paths.iter().flat_map(|paths| paths.keys().cloned()).collect();
        let base_url = config.compiler_options.base_url.is_some();
        Arc::new(Project { resolver, unmapped, mapping: Some(config), patterns, base_url })
    }

    fn nearest(&self, directory: &Path) -> Arc<Project> {
        if let Some(known) = self.nearest.lock().expect("lock").get(directory) {
            return known.clone();
        }
        let found = match (CONFIG_NAMES.iter().map(|name| directory.join(name)).find(|file| file.exists()), directory.parent()) {
            (Some(file), _) => self.project(Some(&file)),
            (None, Some(parent)) => self.nearest(parent),
            (None, None) => self.project(None),
        };
        self.nearest.lock().expect("lock").insert(directory.to_path_buf(), found.clone());
        found
    }

    /// The project file `specifier` stands for when written in `containing`: a file of the project, or the source of
    /// a package that lives in the same repository. Installed packages and declaration files of packages are none.
    pub fn followed(&self, specifier: &str, containing: &Path) -> Option<PathBuf> {
        if specifier.contains('?') {
            return None;
        }
        let project = self.nearest(containing.parent()?);
        let local = specifier.starts_with('.') || Path::new(specifier).is_absolute();
        let Ok(found) = project.resolver.resolve_dts(containing, specifier).map(|found| found.into_path_buf()) else {
            return if local { json_file(&containing.parent()?.join(specifier)) } else { project.mapped_json(specifier) };
        };
        if local {
            return Some(found);
        }
        let installed = is_installed(&found);
        let pattern = project.patterns.iter().any(|pattern| pattern_matches(pattern, specifier));
        if !pattern && is_package_specifier(specifier) && !installed && !is_declaration(&found) {
            return Some(found);
        }
        let through_packages = || project.unmapped.resolve_dts(containing, specifier).is_ok_and(|plain| plain.path() == found);
        ((pattern || project.base_url) && !installed && !through_packages()).then_some(found)
    }

    /// Every module the file names, anywhere in it and in source order: imports, re-exports, `require` and `import()`.
    pub fn sources(&self, file: &Path) -> Arc<Vec<String>> {
        if let Some(known) = self.sources.lock().expect("lock").get(file) {
            return known.clone();
        }
        let found = Arc::new(scanned(file));
        self.sources.lock().expect("lock").insert(file.to_path_buf(), found.clone());
        found
    }

    /// Follows imports breadth first from `entry`, which names `first`, and says whether a file that `wanted` accepts
    /// comes up before the walk would pass a limit.
    pub fn reaches(&self, entry: &Path, first: &[String], limits: Limits, wanted: impl Fn(&Path) -> bool) -> bool {
        let mut queue = vec![(entry.to_path_buf(), 0usize)];
        let mut visited: HashSet<PathBuf> = HashSet::from([entry.to_path_buf()]);
        let mut index = 0;
        while index < queue.len() {
            let (file, depth) = queue[index].clone();
            index += 1;
            if depth > 0 && wanted(&file) {
                return true;
            }
            let named = if depth == 0 { Arc::new(first.to_vec()) } else { self.sources(&file) };
            let mut fresh: Vec<PathBuf> = Vec::new();
            for target in named.iter().filter_map(|specifier| self.followed(specifier, &file)) {
                if !visited.contains(&target) && !fresh.contains(&target) {
                    fresh.push(target);
                }
            }
            let room = if depth < limits.depth { limits.files.saturating_sub(visited.len()) } else { 0 };
            if fresh.len() > room {
                return false;
            }
            for target in fresh {
                visited.insert(target.clone());
                queue.push((target, depth + 1));
            }
        }
        false
    }
}
