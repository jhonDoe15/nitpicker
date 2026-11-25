use crate::typescript::resolve::Modules;
use crate::typescript::rules::Context;
use crate::typescript::rules::config::to_posix;
use crate::typescript::rules::support::estree::string_value;
use oxc_ast::AstKind;
use oxc_ast::ast::{
    Argument, Expression, ImportDeclaration, ImportDeclarationSpecifier, Statement,
    TSModuleReference,
};
use oxc_semantic::SemanticBuilder;
use regex::Regex;
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex, OnceLock};
use std::time::UNIX_EPOCH;

const RULE: &str = "test-must-use-production-runtime";
const MAX_REEXPORT_DEPTH: usize = 3;
const MAX_REEXPORTED_FILES: usize = 50;

static BROWSER_TEST_MODULE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(?:@playwright/|cypress(?:/|$))").expect("browser test regex"));

#[derive(Clone, Debug)]
struct ModuleReference {
    source: String,
    runtime: bool,
    reexport: bool,
}

#[derive(Clone, PartialEq, Eq)]
struct FileStamp {
    len: u64,
    modified_nanos: u128,
}

fn file_stamp(path: &Path) -> Option<FileStamp> {
    let meta = std::fs::metadata(path).ok()?;
    let modified_nanos = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_nanos());
    Some(FileStamp { len: meta.len(), modified_nanos })
}

fn helper_file_for_runner(runner: Option<&str>) -> &'static str {
    match runner {
        Some("jest") => {
            "a file Jest does not run as a test: not named *.test.* or *.spec.*, not under __tests__, and outside the testMatch or testRegex of the Jest config"
        }
        Some("node") => {
            "a file `node --test` does not run: not named *.test.*, *-test.*, *_test.*, test-*.* or test.*, not under a test/ folder, and outside the patterns of the test script"
        }
        Some("mocha") => {
            "a file outside the Mocha spec (test/*.{js,cjs,mjs} by default, or the spec in .mocharc.* and the test script)"
        }
        _ => "a file not named *.test.* or *.spec.*",
    }
}

fn is_runtime_import(import: &ImportDeclaration) -> bool {
    if import.import_kind.is_type() {
        return false;
    }
    let Some(specifiers) = &import.specifiers else {
        return true;
    };
    if specifiers.is_empty() {
        return true;
    }
    specifiers.iter().any(|specifier| match specifier {
        ImportDeclarationSpecifier::ImportSpecifier(named) => !named.import_kind.is_type(),
        _ => true,
    })
}

fn scan_module_references(file: &Path) -> Vec<ModuleReference> {
    let Ok(text) = std::fs::read_to_string(file) else {
        return Vec::new();
    };
    let path_str = file.to_string_lossy();
    crate::typescript::with_parsed(&path_str, &text, |parsed| {
        if parsed.panicked {
            return Vec::new();
        }
        let semantic = SemanticBuilder::new().with_build_nodes(true).build(parsed.program).semantic;
        let mut refs = Vec::new();
        for node in semantic.nodes().iter() {
            match node.kind() {
                AstKind::ImportDeclaration(import) => {
                    if let Some(src) = import.source.value.as_str() {
                        refs.push(ModuleReference {
                            source: src.to_string(),
                            runtime: is_runtime_import(import),
                            reexport: false,
                        });
                    }
                }
                AstKind::ExportFromDeclaration(export) => {
                    if let Some(src) = export.source.value.as_str() {
                        let runtime = !export.export_kind.is_type()
                            && export.specifiers.iter().any(|s| !s.export_kind.is_type());
                        refs.push(ModuleReference {
                            source: src.to_string(),
                            runtime,
                            reexport: true,
                        });
                    }
                }
                AstKind::ExportAllDeclaration(export) => {
                    if let Some(src) = export.source.value.as_str() {
                        refs.push(ModuleReference {
                            source: src.to_string(),
                            runtime: !export.export_kind.is_type(),
                            reexport: true,
                        });
                    }
                }
                AstKind::TSImportEqualsDeclaration(decl) => {
                    if let TSModuleReference::ExternalModuleReference(ext) = &decl.module_reference
                        && let Some(src) = ext.expression.value.as_str()
                    {
                        refs.push(ModuleReference {
                            source: src.to_string(),
                            runtime: !decl.import_kind.is_type(),
                            reexport: false,
                        });
                    }
                }
                AstKind::ImportExpression(import) => {
                    if let Some(src) = string_value(import.source.without_parentheses()) {
                        refs.push(ModuleReference { source: src, runtime: true, reexport: false });
                    }
                }
                AstKind::CallExpression(call) => {
                    if matches!(call.callee.without_parentheses(), Expression::Identifier(id) if id.name == "require")
                        && let Some(src) = call
                            .arguments
                            .first()
                            .and_then(Argument::as_expression)
                            .and_then(|arg| string_value(arg.without_parentheses()))
                    {
                        refs.push(ModuleReference { source: src, runtime: true, reexport: false });
                    }
                }
                _ => {}
            }
        }
        refs
    })
}

fn module_references_of(file: &Path) -> Arc<Vec<ModuleReference>> {
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, (FileStamp, Arc<Vec<ModuleReference>>)>>> =
        OnceLock::new();
    let Some(stamp) = file_stamp(file) else {
        return Arc::new(Vec::new());
    };
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some((cached_stamp, refs)) = cache.lock().expect("lock").get(file)
        && *cached_stamp == stamp
    {
        return refs.clone();
    }
    let refs = Arc::new(scan_module_references(file));
    cache.lock().expect("lock").insert(file.to_path_buf(), (stamp, refs.clone()));
    refs
}

fn lexical_resolve(containing_file: &str, relative: &str, project_root: Option<&str>) -> String {
    let posix_file = to_posix(containing_file);
    let base_dir = match posix_file.rfind('/') {
        Some(idx) => &posix_file[..idx],
        None => "",
    };
    let anchored = if base_dir.starts_with('/') {
        format!("{base_dir}/{relative}")
    } else if let Some(root) = project_root {
        let root = to_posix(root);
        let root = root.trim_end_matches('/');
        if base_dir.is_empty() {
            format!("{root}/{relative}")
        } else {
            format!("{root}/{base_dir}/{relative}")
        }
    } else if base_dir.is_empty() {
        format!("/{relative}")
    } else {
        format!("/{base_dir}/{relative}")
    };

    let mut segments: Vec<&str> = Vec::new();
    for part in anchored.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                segments.pop();
            }
            other => segments.push(other),
        }
    }
    format!("/{}", segments.join("/"))
}

fn is_relative_module(source: &str) -> bool {
    source.starts_with("./") || source.starts_with("../")
}

fn is_production_module(
    context: &Context,
    containing_file: &str,
    source: &str,
    test_support_regex: &Regex,
) -> bool {
    let layout = context.layout();
    for root in layout.source_roots() {
        let prefix = format!("{root}/");
        let mid = format!("/{root}/");
        if source.starts_with(&prefix) || source.contains(&mid) {
            if let Some(idx) = source.find(&prefix)
                && layout.is_source_file(&source[idx..])
            {
                return true;
            }
        }
    }
    let resolved = if is_relative_module(source) {
        lexical_resolve(containing_file, source, context.config.project_root.as_deref())
    } else {
        Modules::shared()
            .followed(source, Path::new(containing_file))
            .map(|p| to_posix(&p.to_string_lossy()))
            .unwrap_or_default()
    };
    let Some(root_relative) =
        layout.source_path_of(&format!("{resolved}/"), context.config.project_root.as_deref())
    else {
        return false;
    };
    !(test_support_regex.is_match(&root_relative) || layout.is_test_file(&root_relative))
}

fn helper_files(helper: PathBuf) -> Vec<PathBuf> {
    let mut visited: HashSet<PathBuf> = HashSet::from([helper.clone()]);
    let mut queue: VecDeque<(PathBuf, usize)> = VecDeque::from([(helper.clone(), 0)]);
    let mut result = vec![helper];

    while let Some((file, depth)) = queue.pop_front() {
        if depth >= MAX_REEXPORT_DEPTH {
            continue;
        }
        let refs = module_references_of(&file);
        for reference in refs.iter().filter(|r| r.reexport) {
            if let Some(target) = Modules::shared().followed(&reference.source, &file) {
                if visited.contains(&target) {
                    continue;
                }
                if visited.len() >= MAX_REEXPORTED_FILES {
                    return result;
                }
                visited.insert(target.clone());
                result.push(target.clone());
                queue.push_back((target, depth + 1));
            }
        }
    }
    result
}

fn helper_reaches(
    context: &Context,
    containing_file: &str,
    source: &str,
    test_support_regex: &Regex,
) -> bool {
    let Some(helper) = Modules::shared().followed(source, Path::new(containing_file)) else {
        return false;
    };
    helper_files(helper).into_iter().any(|file| {
        let file_str = to_posix(&file.to_string_lossy());
        module_references_of(&file).iter().any(|reference| {
            reference.runtime && is_production_module(context, &file_str, &reference.source, test_support_regex)
        })
    })
}

fn reaches_production(
    context: &Context,
    containing_file: &str,
    source: &str,
    test_support_regex: &Regex,
) -> bool {
    is_production_module(context, containing_file, source, test_support_regex)
        || helper_reaches(context, containing_file, source, test_support_regex)
}

fn expression_module_source(expr: &Expression) -> Option<String> {
    match expr.without_parentheses() {
        Expression::ImportExpression(import) => match import.source.without_parentheses() {
            Expression::StringLiteral(lit) => lit.value.as_str().map(String::from),
            _ => None,
        },
        Expression::CallExpression(call) => {
            if matches!(call.callee.without_parentheses(), Expression::Identifier(id) if id.name == "require")
                && let Some(Argument::StringLiteral(lit)) = call.arguments.first()
            {
                lit.value.as_str().map(String::from)
            } else {
                None
            }
        }
        _ => None,
    }
}

fn top_level_statement_sources(context: &Context) -> Vec<String> {
    let mut sources = Vec::new();
    for statement in &context.file.program.body {
        match statement {
            Statement::ImportDeclaration(import) => {
                if let Some(s) = import.source.value.as_str() {
                    sources.push(s.to_string());
                }
            }
            Statement::ExportFromDeclaration(export) => {
                if let Some(s) = export.source.value.as_str() {
                    sources.push(s.to_string());
                }
            }
            Statement::ExportAllDeclaration(export) => {
                if let Some(s) = export.source.value.as_str() {
                    sources.push(s.to_string());
                }
            }
            Statement::TSImportEqualsDeclaration(decl) => {
                if let TSModuleReference::ExternalModuleReference(ext) = &decl.module_reference
                    && let Some(s) = ext.expression.value.as_str()
                {
                    sources.push(s.to_string());
                }
            }
            Statement::ExpressionStatement(stmt) => {
                if let Some(s) = expression_module_source(&stmt.expression) {
                    sources.push(s);
                }
            }
            Statement::VariableDeclaration(decl) => {
                for declarator in &decl.declarations {
                    if let Some(init) = &declarator.init
                        && let Some(s) = expression_module_source(init)
                    {
                        sources.push(s);
                    }
                }
            }
            _ => {}
        }
    }
    sources
}

fn is_exempt_test(context: &Context, filename: &str) -> bool {
    let layout = context.layout();
    let project_file = context.config.relative_path(context.display());
    if !(layout.is_runner_test_file(&project_file) || layout.is_runner_test_file(filename)) {
        return true;
    }

    let test_roots = layout.test_roots();
    let default_exempt = if test_roots.is_empty() {
        r"\.policy\.test\.[cm]?[jt]s$".to_string()
    } else {
        format!(r"/(?:{})/contract/|\.policy\.test\.[cm]?[jt]s$", test_roots.join("|"))
    };
    let pattern_str = context
        .rule_options(RULE)
        .and_then(|opts| opts.get("exemptPattern"))
        .and_then(|v| v.as_str())
        .unwrap_or(&default_exempt);

    if let Ok(exempt_regex) = Regex::new(pattern_str)
        && (exempt_regex.is_match(filename) || exempt_regex.is_match(&format!("/{project_file}")))
    {
        return true;
    }

    if layout.is_end_to_end_test(&project_file) {
        return true;
    }
    top_level_statement_sources(context)
        .iter()
        .any(|source| BROWSER_TEST_MODULE.is_match(source))
}

fn build_test_support_regex(test_roots: &[String]) -> Regex {
    let mut parts = vec![r"(?:^|/)(?:__tests__|fixtures)(?:/|$)".to_string()];
    if !test_roots.is_empty() {
        let joined = test_roots.iter().map(|r| regex::escape(r)).collect::<Vec<_>>().join("|");
        parts.push(format!(r"^(?:{joined})(?:/|$)"));
    }
    parts.push(r"\.(?:test|spec)\.[cm]?[jt]sx?$".to_string());
    Regex::new(&parts.join("|")).expect("test support regex")
}

pub fn check(context: &mut Context) {
    let filename = to_posix(context.file.path);
    if is_exempt_test(context, &filename) {
        return;
    }

    let test_support_regex = build_test_support_regex(context.layout().test_roots());
    let mut has_production_runtime = false;

    for node in context.semantic.nodes().iter() {
        match node.kind() {
            AstKind::ImportDeclaration(import) => {
                if is_runtime_import(import)
                    && let Some(src) = import.source.value.as_str()
                    && reaches_production(context, &filename, src, &test_support_regex)
                {
                    has_production_runtime = true;
                    break;
                }
            }
            AstKind::ImportExpression(import) => {
                if let Expression::StringLiteral(lit) = import.source.without_parentheses()
                    && let Some(src) = lit.value.as_str()
                    && reaches_production(context, &filename, src, &test_support_regex)
                {
                    has_production_runtime = true;
                    break;
                }
            }
            AstKind::CallExpression(call) => {
                if matches!(call.callee.without_parentheses(), Expression::Identifier(id) if id.name == "require")
                    && let Some(Argument::StringLiteral(lit)) = call.arguments.first()
                    && let Some(src) = lit.value.as_str()
                    && reaches_production(context, &filename, src, &test_support_regex)
                {
                    has_production_runtime = true;
                    break;
                }
            }
            _ => {}
        }
    }

    if !has_production_runtime {
        let runner = context
            .rule_options(RULE)
            .and_then(|opts| opts.get("runner"))
            .and_then(|v| v.as_str());
        let helper_file = helper_file_for_runner(runner);
        let span = context.file.program.span;
        context.report_range(
            RULE,
            span.start,
            Some(span.end),
            format!(
                "This test imports no production code at runtime (only types, libraries, or helpers that import none). Import the code under test from the source root, directly or through a helper such as a render function that imports it. Shared helpers belong in {helper_file}."
            ),
        );
    }
}
