//! Project layout and per-rule options passed to `typescript-lint` via `--config <file>`.
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};

const DEFAULT_SOURCE_ROOTS: &[&str] = &["src"];
const DEFAULT_TEST_ROOTS: &[&str] = &["test", "tests", "__tests__", "e2e"];
const DEFAULT_EXTENSIONS: &[&str] = &["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"];
const DEFAULT_TEST_INCLUDE: &[&str] = &["**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"];
const END_TO_END_ROOT: &str = "e2e";
const PROJECT_ROOT: &str = ".";
const TEST_SUPPORT_DIRECTORY: &str = "test-support";
const DEPENDENCY_PATH_PATTERN: &str = r"(?:^|/)(?:node_modules|\.yarn)(?:/|$)";
const FIXTURE_PATH_PATTERN: &str = r"(?:^|/)(?:fixtures|__fixtures__)/";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TestPatterns {
    pub include: Vec<String>,
    pub exclude: Vec<String>,
    pub include_regexes: Vec<String>,
    pub exclude_regexes: Vec<String>,
}

impl Default for TestPatterns {
    fn default() -> Self {
        Self {
            include: DEFAULT_TEST_INCLUDE.iter().map(|s| (*s).to_string()).collect(),
            exclude: Vec::new(),
            include_regexes: Vec::new(),
            exclude_regexes: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LayoutSpec {
    pub source_roots: Vec<String>,
    pub test_roots: Vec<String>,
    pub extensions: Vec<String>,
    pub colocated_tests: bool,
    pub excluded_globs: Vec<String>,
    pub generated_files: Vec<String>,
    pub test_patterns: TestPatterns,
}

impl Default for LayoutSpec {
    fn default() -> Self {
        Self {
            source_roots: DEFAULT_SOURCE_ROOTS.iter().map(|s| (*s).to_string()).collect(),
            test_roots: DEFAULT_TEST_ROOTS.iter().map(|s| (*s).to_string()).collect(),
            extensions: DEFAULT_EXTENSIONS.iter().map(|s| (*s).to_string()).collect(),
            colocated_tests: false,
            excluded_globs: Vec::new(),
            generated_files: Vec::new(),
            test_patterns: TestPatterns::default(),
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct ConfigInput {
    project_root: Option<String>,
    layout: LayoutSpec,
    rules: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug)]
pub struct ProjectLayout {
    spec: LayoutSpec,
    test_pattern: Regex,
    source_pattern: Regex,
    code_pattern: Regex,
    dependency_pattern: Regex,
    fixture_pattern: Regex,
    excluded_matchers: Vec<Regex>,
    generated_set: HashSet<String>,
    runner_include_globs: Vec<Regex>,
    runner_include_regexes: Vec<Regex>,
    runner_exclude_globs: Vec<Regex>,
    runner_exclude_regexes: Vec<Regex>,
}

#[derive(Debug)]
pub struct LintConfig {
    pub project_root: Option<String>,
    pub layout: ProjectLayout,
    pub rules: BTreeMap<String, serde_json::Value>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileClassification {
    pub file: String,
    pub is_source_file: bool,
    pub is_test_file: bool,
    pub is_test_path: bool,
    pub is_runner_test_file: bool,
    pub is_runnable_test_file: bool,
    pub is_excluded: bool,
    pub is_generated_path: bool,
    pub is_end_to_end_test: bool,
    pub source_root: Option<String>,
}

pub fn to_posix(file: &str) -> String {
    file.replace('\\', "/")
}

pub fn normalize_root(root: &str) -> String {
    let segments: Vec<&str> = root
        .split(['/', '\\'])
        .filter(|segment| !segment.is_empty() && *segment != ".")
        .collect();
    if segments.is_empty() { PROJECT_ROOT.to_string() } else { segments.join("/") }
}

pub fn normalized_glob(glob: &str) -> String {
    let posix = to_posix(glob);
    let mut current = posix.as_str();
    while let Some(rest) = current.strip_prefix("./") {
        current = rest;
    }
    current.to_string()
}

fn root_prefix_pattern(roots: &[String]) -> String {
    roots
        .iter()
        .map(|root| if root == PROJECT_ROOT { String::new() } else { format!("{}/", regex::escape(root)) })
        .collect::<Vec<_>>()
        .join("|")
}

fn compile_regex(pattern: &str) -> Result<Regex, String> {
    Regex::new(pattern).map_err(|error| format!("invalid regex `{pattern}`: {error}"))
}

/// Converts a glob pattern (including `{a,b}`, `[abc]`, and picomatch extglobs `?(...)`, `+(...)`,
/// `*(...)`, `@(...)`) into an anchored Rust regex source matching POSIX relative paths.
pub fn glob_to_regex_source(glob: &str) -> String {
    let chars: Vec<char> = glob.chars().collect();
    let (body, _) = parse_glob_sequence(&chars, 0, None);
    format!("^(?:{body})$")
}

fn parse_glob_sequence(chars: &[char], mut index: usize, terminator: Option<char>) -> (String, usize) {
    let mut out = String::new();
    while index < chars.len() {
        let ch = chars[index];
        if terminator == Some(ch) {
            return (out, index + 1);
        }
        if terminator == Some('}') && ch == ',' {
            out.push('|');
            index += 1;
            continue;
        }
        if terminator == Some(')') && ch == '|' {
            out.push('|');
            index += 1;
            continue;
        }
        if ch == '\\' && index + 1 < chars.len() {
            out.push_str(&regex::escape(&chars[index + 1].to_string()));
            index += 2;
            continue;
        }
        if matches!(ch, '?' | '+' | '*' | '@') && chars.get(index + 1) == Some(&'(') {
            let (inner, next) = parse_glob_sequence(chars, index + 2, Some(')'));
            out.push_str("(?:");
            out.push_str(&inner);
            out.push(')');
            match ch {
                '?' => out.push('?'),
                '+' => out.push('+'),
                '*' => out.push('*'),
                _ => {}
            }
            index = next;
            continue;
        }
        if ch == '*' && chars.get(index + 1) == Some(&'*') {
            if chars.get(index + 2) == Some(&'/') {
                out.push_str("(?:|.*/)");
                index += 3;
            } else {
                out.push_str(".*");
                index += 2;
            }
            continue;
        }
        match ch {
            '*' => { out.push_str("[^/]*"); index += 1; }
            '?' => { out.push_str("[^/]"); index += 1; }
            '{' => {
                let (inner, next) = parse_glob_sequence(chars, index + 1, Some('}'));
                out.push_str("(?:");
                out.push_str(&inner);
                out.push(')');
                index = next;
            }
            '[' => {
                let (class, next) = parse_char_class(chars, index + 1);
                out.push_str(&class);
                index = next;
            }
            other => {
                out.push_str(&regex::escape(&other.to_string()));
                index += 1;
            }
        }
    }
    (out, index)
}

fn parse_char_class(chars: &[char], mut index: usize) -> (String, usize) {
    let mut out = String::from("[");
    if matches!(chars.get(index), Some('!') | Some('^')) {
        out.push('^');
        index += 1;
    }
    while index < chars.len() {
        let ch = chars[index];
        index += 1;
        if ch == ']' {
            out.push(']');
            return (out, index);
        }
        if ch == '\\' && index < chars.len() {
            out.push('\\');
            out.push(chars[index]);
            index += 1;
        } else {
            out.push(ch);
        }
    }
    (regex::escape(&out), index)
}

fn compile_globs(globs: &[String]) -> Result<Vec<Regex>, String> {
    globs.iter().map(|glob| compile_regex(&glob_to_regex_source(&normalized_glob(glob)))).collect()
}

fn compile_regexes(patterns: &[String]) -> Result<Vec<Regex>, String> {
    patterns.iter().map(|pattern| compile_regex(pattern)).collect()
}

impl ProjectLayout {
    pub fn from_spec(mut spec: LayoutSpec) -> Result<Self, String> {
        spec.source_roots = spec.source_roots.iter().map(|root| normalize_root(root)).collect();
        spec.test_roots = spec.test_roots.iter().map(|root| normalize_root(root)).collect();
        spec.generated_files = spec.generated_files.iter().map(|file| normalized_glob(file)).collect();
        spec.test_patterns.include = spec.test_patterns.include.iter().map(|glob| normalized_glob(glob)).collect();
        spec.test_patterns.exclude = spec.test_patterns.exclude.iter().map(|glob| normalized_glob(glob)).collect();

        let source_prefixes = root_prefix_pattern(&spec.source_roots);
        let suffix = format!("(?:{})$", spec.extensions.iter().map(|ext| regex::escape(ext)).collect::<Vec<_>>().join("|"));

        let mut test_branches = Vec::new();
        if !spec.test_roots.is_empty() {
            let test_alternatives = spec.test_roots.iter().map(|root| regex::escape(root)).collect::<Vec<_>>().join("|");
            test_branches.push(format!("^(?:{test_alternatives})/"));
        }
        if !spec.source_roots.is_empty() {
            test_branches.push(format!(r"^(?:{source_prefixes}).*\.(?:test|spec)\.{suffix}"));
            test_branches.push(format!("^(?:{source_prefixes})(?:.*/)?__tests__/"));
            if spec.colocated_tests {
                test_branches.push(format!("^(?:{source_prefixes})(?:.*/)?{TEST_SUPPORT_DIRECTORY}/"));
            }
        }
        let test_pattern_source = if test_branches.is_empty() {
            "$^".to_string()
        } else {
            test_branches.into_iter().map(|branch| format!("(?:{branch})")).collect::<Vec<_>>().join("|")
        };
        let source_pattern_source = if spec.source_roots.is_empty() {
            "$^".to_string()
        } else {
            format!(r"^(?:{source_prefixes}).*\.{suffix}")
        };

        let excluded_matchers = compile_globs(&spec.excluded_globs)?;
        let runner_include_globs = compile_globs(&spec.test_patterns.include)?;
        let runner_include_regexes = compile_regexes(&spec.test_patterns.include_regexes)?;
        let runner_exclude_globs = compile_globs(&spec.test_patterns.exclude)?;
        let runner_exclude_regexes = compile_regexes(&spec.test_patterns.exclude_regexes)?;
        let generated_set = spec.generated_files.iter().cloned().collect();

        Ok(Self {
            test_pattern: compile_regex(&test_pattern_source)?,
            source_pattern: compile_regex(&source_pattern_source)?,
            code_pattern: compile_regex(&format!(r"\.{suffix}"))?,
            dependency_pattern: compile_regex(DEPENDENCY_PATH_PATTERN)?,
            fixture_pattern: compile_regex(FIXTURE_PATH_PATTERN)?,
            excluded_matchers,
            generated_set,
            runner_include_globs,
            runner_include_regexes,
            runner_exclude_globs,
            runner_exclude_regexes,
            spec,
        })
    }

    pub fn spec(&self) -> &LayoutSpec {
        &self.spec
    }

    pub fn source_roots(&self) -> &[String] {
        &self.spec.source_roots
    }

    pub fn test_roots(&self) -> &[String] {
        &self.spec.test_roots
    }

    pub fn is_excluded(&self, file: &str) -> bool {
        let normalized = to_posix(file);
        self.excluded_matchers.iter().any(|matcher| matcher.is_match(&normalized))
    }

    pub fn is_generated_path(&self, file: &str) -> bool {
        let normalized = to_posix(file);
        self.dependency_pattern.is_match(&normalized) || self.generated_set.contains(&normalized)
    }

    pub fn is_fixture_path(&self, file: &str) -> bool {
        self.fixture_pattern.is_match(&to_posix(file))
    }

    pub fn is_test_path(&self, file: &str) -> bool {
        self.test_pattern.is_match(&to_posix(file))
    }

    pub fn is_runner_test_file(&self, file: &str) -> bool {
        let normalized = normalized_glob(file);
        let slash_prefixed = format!("/{normalized}");
        let included = self.runner_include_globs.iter().any(|matcher| matcher.is_match(&normalized))
            || self.runner_include_regexes.iter().any(|regex| regex.is_match(&slash_prefixed));
        if !included {
            return false;
        }
        let excluded = self.runner_exclude_globs.iter().any(|matcher| matcher.is_match(&normalized))
            || self.runner_exclude_regexes.iter().any(|regex| regex.is_match(&slash_prefixed));
        !excluded
    }

    pub fn is_test_file(&self, file: &str) -> bool {
        let normalized = to_posix(file);
        if !self.code_pattern.is_match(&normalized) || normalized.ends_with(".d.ts") {
            return false;
        }
        self.test_pattern.is_match(&normalized)
            || (self.source_pattern.is_match(&normalized) && self.is_runner_test_file(&normalized))
    }

    pub fn is_runnable_test_file(&self, file: &str) -> bool {
        self.is_test_file(file) && self.is_runner_test_file(file)
    }

    pub fn is_source_file(&self, file: &str) -> bool {
        let normalized = to_posix(file);
        self.source_pattern.is_match(&normalized)
            && !self.is_test_file(&normalized)
            && !self.is_generated_path(&normalized)
            && !normalized.ends_with(".d.ts")
            && !self.is_excluded(&normalized)
    }

    pub fn is_end_to_end_test(&self, file: &str) -> bool {
        self.spec.test_roots.iter().any(|root| root == END_TO_END_ROOT)
            && to_posix(file).starts_with(&format!("{END_TO_END_ROOT}/"))
    }

    pub fn source_root_of(&self, file: &str) -> Option<&str> {
        let normalized = to_posix(file);
        let named = self
            .spec
            .source_roots
            .iter()
            .filter(|root| root.as_str() != PROJECT_ROOT)
            .filter(|root| normalized.starts_with(&format!("{root}/")) || normalized.contains(&format!("/{root}/")))
            .max_by_key(|root| root.len());
        named.map(String::as_str).or_else(|| {
            self.spec.source_roots.iter().find(|root| root.as_str() == PROJECT_ROOT).map(String::as_str)
        })
    }

    pub fn source_path_of(&self, file: &str, project_root: Option<&str>) -> Option<String> {
        let normalized = to_posix(file);
        let found = if let Some(named) = self
            .spec
            .source_roots
            .iter()
            .find(|root| root.as_str() != PROJECT_ROOT && normalized.contains(&format!("/{root}/")))
        {
            let marker = format!("/{named}/");
            let index = normalized.find(&marker)?;
            Some(normalized[index + 1..].to_string())
        } else if self.spec.source_roots.iter().any(|root| root.as_str() == PROJECT_ROOT)
            && std::path::Path::new(&normalized).is_absolute()
        {
            let root = project_root
                .map(|r| to_posix(r).trim_end_matches('/').to_string())
                .or_else(|| {
                    std::env::current_dir()
                        .ok()
                        .map(|p| to_posix(&p.to_string_lossy()).trim_end_matches('/').to_string())
                })?;
            let stripped = normalized.strip_prefix(&format!("{root}/"))?;
            (!stripped.is_empty() && !stripped.starts_with("..")).then(|| stripped.to_string())
        } else {
            None
        }?;
        let hidden = self.is_generated_path(&found) || self.is_excluded(&found);
        if hidden && self.spec.source_roots.iter().any(|root| root.as_str() == PROJECT_ROOT) {
            None
        } else {
            Some(found)
        }
    }
}

impl Default for ProjectLayout {
    fn default() -> Self {
        Self::from_spec(LayoutSpec::default()).expect("default layout is valid")
    }
}

impl Default for LintConfig {
    fn default() -> Self {
        Self { project_root: None, layout: ProjectLayout::default(), rules: BTreeMap::new() }
    }
}

impl LintConfig {
    pub fn from_json(text: &str) -> Result<Self, String> {
        let input: ConfigInput = serde_json::from_str(text).map_err(|error| format!("invalid config JSON: {error}"))?;
        let layout = ProjectLayout::from_spec(input.layout)?;
        let project_root = input.project_root.map(|root| to_posix(&root).trim_end_matches('/').to_string());
        Ok(Self { project_root, layout, rules: input.rules })
    }

    pub fn from_file(path: &str) -> Result<Self, String> {
        let text = std::fs::read_to_string(path).map_err(|error| format!("cannot read config {path}: {error}"))?;
        Self::from_json(&text)
    }

    pub fn relative_path(&self, file: &str) -> String {
        let posix = to_posix(file);
        let stripped = match &self.project_root {
            Some(root) if !root.is_empty() => posix
                .strip_prefix(&format!("{root}/"))
                .unwrap_or(&posix),
            _ => &posix,
        };
        normalized_glob(stripped)
    }

    pub fn is_source_file(&self, file: &str) -> bool {
        self.layout.is_source_file(&self.relative_path(file))
    }

    pub fn is_test_file(&self, file: &str) -> bool {
        self.layout.is_test_file(&self.relative_path(file))
    }

    pub fn classify(&self, file: &str) -> FileClassification {
        let relative = self.relative_path(file);
        FileClassification {
            is_source_file: self.layout.is_source_file(&relative),
            is_test_file: self.layout.is_test_file(&relative),
            is_test_path: self.layout.is_test_path(&relative),
            is_runner_test_file: self.layout.is_runner_test_file(&relative),
            is_runnable_test_file: self.layout.is_runnable_test_file(&relative),
            is_excluded: self.layout.is_excluded(&relative),
            is_generated_path: self.layout.is_generated_path(&relative),
            is_end_to_end_test: self.layout.is_end_to_end_test(&relative),
            source_root: self.layout.source_root_of(&relative).map(String::from),
            file: relative,
        }
    }

    pub fn rule_options(&self, rule: &str) -> Option<&serde_json::Value> {
        self.rules.get(rule).or_else(|| {
            if let Some(bare) = rule.strip_prefix("nitpicker/") {
                self.rules.get(bare)
            } else {
                self.rules.get(&format!("nitpicker/{rule}"))
            }
        })
    }

    pub fn dump(&self, files: &[super::Listed]) -> serde_json::Value {
        let classified: Vec<FileClassification> = files.iter().map(|listed| self.classify(&listed.display)).collect();
        serde_json::json!({
            "projectRoot": self.project_root,
            "layout": self.layout.spec(),
            "rules": self.rules,
            "files": classified,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn multi_root_layout_classifies_sources_and_tests() {
        let config = LintConfig::from_json(
            r#"{
                "projectRoot": "/workspace/monorepo",
                "layout": {
                    "sourceRoots": ["./packages/api/src/", "packages\\web\\src", "shared"],
                    "testRoots": ["test", "integration", "e2e"],
                    "colocatedTests": true,
                    "excludedGlobs": ["packages/api/src/legacy/**"],
                    "generatedFiles": ["shared/schema.ts"],
                    "testPatterns": {
                        "include": ["**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}", "integration/**/*.ts"],
                        "exclude": ["**/*.fixture.ts"]
                    }
                },
                "rules": {
                    "report-module-load-effects": { "commonJsExports": true },
                    "nitpicker/test-must-use-production-runtime": { "runner": "vitest" }
                }
            }"#,
        )
        .expect("valid config");

        assert_eq!(config.layout.source_roots(), &["packages/api/src", "packages/web/src", "shared"]);
        assert_eq!(config.layout.test_roots(), &["test", "integration", "e2e"]);

        assert!(config.is_source_file("packages/api/src/server.ts"));
        assert!(config.is_source_file("/workspace/monorepo/packages/web/src/App.tsx"));
        assert!(config.is_source_file(".\\shared\\math.mts"));
        assert!(!config.is_source_file("packages/api/src/server.test.ts"));
        assert!(!config.is_source_file("packages/api/src/legacy/old.ts"));
        assert!(!config.is_source_file("shared/schema.ts"));
        assert!(!config.is_source_file("packages/api/src/types.d.ts"));

        assert!(config.is_test_file("packages/api/src/server.test.ts"));
        assert!(config.is_test_file("packages/web/src/__tests__/App.tsx"));
        assert!(config.is_test_file("packages/web/src/test-support/helper.ts"));
        assert!(config.is_test_file("test/smoke.ts"));
        assert!(config.is_test_file("integration/api.ts"));
        assert!(config.layout.is_end_to_end_test("e2e/login.spec.ts"));
        assert!(!config.layout.is_runner_test_file("integration/a.fixture.ts"));

        assert_eq!(config.rule_options("report-module-load-effects"), Some(&serde_json::json!({ "commonJsExports": true })));
        assert_eq!(config.rule_options("nitpicker/report-module-load-effects"), Some(&serde_json::json!({ "commonJsExports": true })));
        assert_eq!(config.rule_options("test-must-use-production-runtime"), Some(&serde_json::json!({ "runner": "vitest" })));
        assert_eq!(config.rule_options("unknown-rule"), None);
    }

    #[test]
    fn jest_extglob_patterns_match_like_picomatch() {
        let config = LintConfig::from_json(
            r#"{
                "layout": {
                    "testPatterns": {
                        "include": [
                            "**/__tests__/**/*.?([mc])[jt]s?(x)",
                            "**/?(*.)+(spec|test).?([mc])[jt]s?(x)"
                        ],
                        "excludeRegexes": ["/node_modules/"]
                    }
                }
            }"#,
        )
        .expect("valid jest config");

        assert!(config.layout.is_runner_test_file("src/__tests__/unit/foo.tsx"));
        assert!(config.layout.is_runner_test_file("src/a.spec.mts"));
        assert!(config.layout.is_runner_test_file("test.js"));
        assert!(!config.layout.is_runner_test_file("src/app.ts"));
        assert!(!config.layout.is_runner_test_file("node_modules/pkg/a.test.js"));
    }
}
