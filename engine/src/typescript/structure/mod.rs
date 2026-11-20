//! The structure checks of the TypeScript preset: the same facts the Node analyzer hands to the shared rules.
pub mod metrics;
pub mod names;
pub mod shape;

use super::tree::Tree;
use super::{ParsedFile, with_parsed};
use rayon::prelude::*;
use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub struct FunctionEntry {
    pub source: String,
    pub function: String,
    pub start: u32,
    pub end: u32,
    pub lines: u32,
    pub parameters: u32,
    pub statements: u32,
    #[serde(rename = "maxControlNesting")]
    pub max_control_nesting: u32,
}

#[derive(Serialize, Clone, Debug)]
pub struct ClassEntry {
    pub source: String,
    pub class: String,
    pub start: u32,
    pub end: u32,
    pub lines: u32,
    pub members: u32,
    pub methods: u32,
}

#[derive(Serialize, Clone, Debug)]
pub struct Unparsed {
    pub file: String,
    pub reason: String,
}

#[derive(Serialize, Default)]
pub struct Summary {
    pub files: usize,
    pub lines: u64,
    pub functions: usize,
    pub classes: usize,
}

#[derive(Serialize, Default)]
pub struct Analysis {
    pub summary: Summary,
    pub functions: Vec<FunctionEntry>,
    pub classes: Vec<ClassEntry>,
    pub unparsed: Vec<Unparsed>,
}

pub struct SourceAnalysis {
    pub lines: u32,
    pub functions: Vec<FunctionEntry>,
    pub classes: Vec<ClassEntry>,
}

pub fn analyze_source(file: &ParsedFile, display: &str) -> Result<SourceAnalysis, String> {
    if file.panicked {
        return Err(file.errors.join("; "));
    }
    let tree = Tree::of(file.program);
    let shape = shape::Shape { file, tree: &tree };
    let names = names::function_names(&shape);
    let (functions, classes) = metrics::entries(&shape, &names, display);
    Ok(SourceAnalysis { lines: file.lines.count(), functions, classes })
}

/// `files` pairs the path to read with the path to report, in the order the report lists them.
pub fn analyze_files(files: &[(String, String)]) -> Analysis {
    let per_file: Vec<Result<SourceAnalysis, Unparsed>> = files
        .par_iter()
        .map(|(path, display)| {
            let text = std::fs::read_to_string(path).map_err(|error| Unparsed { file: display.clone(), reason: error.to_string() })?;
            let text = text.strip_prefix('\u{feff}').unwrap_or(&text);
            with_parsed(path, text, |file| analyze_source(file, display)).map_err(|reason| Unparsed { file: display.clone(), reason })
        })
        .collect();
    let mut analysis = Analysis { summary: Summary { files: files.len(), ..Summary::default() }, ..Analysis::default() };
    for result in per_file {
        match result {
            Ok(source) => {
                analysis.summary.lines += u64::from(source.lines);
                analysis.functions.extend(source.functions);
                analysis.classes.extend(source.classes);
            }
            Err(unparsed) => analysis.unparsed.push(unparsed),
        }
    }
    analysis.summary.functions = analysis.functions.len();
    analysis.summary.classes = analysis.classes.len();
    analysis
}
