//! `isGeneratedPrismaClient`: whether a file is in the output folder of a Prisma client generator, or in a
//! folder that holds a client next to its schema. Schemas are read from disk once for the run.
use regex::Regex;
use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;

const SCHEMA: &str = "schema.prisma";
const CLIENT_ENTRIES: [&str; 3] = ["index.d.ts", "client.d.ts", "client.ts"];
const CLIENT_DEPTH: usize = 2;
const CLIENT_PROVIDERS: [&str; 2] = ["prisma-client-js", "prisma-client"];

struct Patterns {
    generator: Regex,
    provider: Regex,
    output: Regex,
}

fn patterns() -> &'static Patterns {
    static PATTERNS: OnceLock<Patterns> = OnceLock::new();
    PATTERNS.get_or_init(|| Patterns {
        generator: Regex::new(r"generator[\s\x{FEFF}]+[A-Za-z0-9_]+[\s\x{FEFF}]*\{([^}]*)\}").expect("generator pattern"),
        provider: Regex::new(r#"provider[\s\x{FEFF}]*=[\s\x{FEFF}]*"([^"]+)""#).expect("provider pattern"),
        output: Regex::new(r#"output[\s\x{FEFF}]*=[\s\x{FEFF}]*"([^"]+)""#).expect("output pattern"),
    })
}

thread_local! {
    static OUTPUTS: RefCell<HashMap<PathBuf, Vec<PathBuf>>> = RefCell::new(HashMap::new());
    static FILES: RefCell<HashMap<String, bool>> = RefCell::new(HashMap::new());
}

fn normalized(path: &Path) -> PathBuf {
    let mut parts: Vec<Component> = Vec::new();
    for part in path.components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir if matches!(parts.last(), Some(Component::Normal(_))) => {
                parts.pop();
            }
            Component::ParentDir if matches!(parts.last(), Some(Component::RootDir)) => {}
            other => parts.push(other),
        }
    }
    parts.iter().collect()
}

fn generator_outputs(file: &Path) -> Vec<PathBuf> {
    let Ok(text) = std::fs::read_to_string(file) else { return Vec::new() };
    let patterns = patterns();
    let mut outputs = Vec::new();
    for generator in patterns.generator.captures_iter(&text) {
        let body = generator.get(1).map_or("", |body| body.as_str());
        let provider = patterns.provider.captures(body).and_then(|found| found.get(1)).map(|found| found.as_str());
        let output = patterns.output.captures(body).and_then(|found| found.get(1)).map(|found| found.as_str());
        if let (Some(provider), Some(output)) = (provider, output)
            && CLIENT_PROVIDERS.contains(&provider)
        {
            outputs.push(normalized(&file.parent().unwrap_or(Path::new("/")).join(output)));
        }
    }
    outputs
}

fn schema_files(directory: &Path) -> Vec<PathBuf> {
    let mut files = vec![directory.join("prisma").join(SCHEMA), directory.join(SCHEMA)];
    if let Ok(entries) = std::fs::read_dir(directory.join("prisma").join("schema")) {
        files.extend(entries.flatten().map(|entry| entry.path()).filter(|path| path.extension().is_some_and(|extension| extension == "prisma")));
    }
    files
}

fn outputs_of(directory: &Path) -> Vec<PathBuf> {
    if let Some(known) = OUTPUTS.with(|outputs| outputs.borrow().get(directory).cloned()) {
        return known;
    }
    let found: Vec<PathBuf> = schema_files(directory).iter().flat_map(|file| generator_outputs(file)).collect();
    OUTPUTS.with(|outputs| outputs.borrow_mut().insert(directory.to_path_buf(), found.clone()));
    found
}

fn is_client_directory(directory: &Path) -> bool {
    directory.join(SCHEMA).exists() && CLIENT_ENTRIES.iter().any(|name| directory.join(name).exists())
}

fn is_strictly_inside(parent: &Path, candidate: &Path) -> bool {
    candidate.strip_prefix(parent).is_ok_and(|relative| !relative.as_os_str().is_empty() && !relative.to_string_lossy().starts_with(".."))
}

fn computed(file: &str) -> bool {
    let file = normalized(Path::new(file));
    let directories: Vec<&Path> = file.parent().into_iter().flat_map(Path::ancestors).collect();
    directories.iter().take(CLIENT_DEPTH).any(|directory| is_client_directory(directory))
        || directories.iter().any(|directory| outputs_of(directory).iter().any(|output| is_strictly_inside(output, &file)))
}

pub fn is_generated_prisma_client(file: &str) -> bool {
    if let Some(known) = FILES.with(|files| files.borrow().get(file).copied()) {
        return known;
    }
    let found = computed(file);
    FILES.with(|files| files.borrow_mut().insert(file.to_string(), found));
    found
}
