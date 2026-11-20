//! TypeScript and JavaScript front end: one oxc parse per file, shared by every check of this language.
pub mod lines;
pub mod rules;
pub mod structure;
pub mod tree;

use oxc_allocator::Allocator;
use oxc_ast::ast::Program;
use oxc_parser::{ParseOptions, Parser};
use oxc_span::SourceType;

pub const EXTENSIONS: &[&str] = &["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"];

/// One parsed file. The allocator that owns the tree lives as long as the closure given to `with_parsed`.
pub struct ParsedFile<'a> {
    pub path: &'a str,
    pub text: &'a str,
    pub source_type: SourceType,
    pub program: &'a Program<'a>,
    pub lines: lines::LineTable,
    /// The parser gave up, or reported an error that leaves no usable tree.
    pub panicked: bool,
    pub errors: Vec<String>,
}

impl<'a> ParsedFile<'a> {
    pub fn slice(&self, start: u32, end: u32) -> &'a str {
        &self.text[start as usize..end as usize]
    }
    /// Scopes, symbols and references, built only for the checks that ask.
    pub fn semantic(&self) -> oxc_semantic::Semantic<'a> {
        oxc_semantic::SemanticBuilder::new().build(self.program).semantic
    }
}

/// The compiler treats `.js` sources as JSX-capable and decides module or script from the content.
pub fn source_type_of(path: &str) -> SourceType {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".d.ts") || lower.ends_with(".d.mts") || lower.ends_with(".d.cts") {
        return SourceType::d_ts();
    }
    match lower.rsplit('.').next() {
        Some("tsx") => SourceType::tsx(),
        Some("ts" | "mts" | "cts") => SourceType::ts(),
        _ => SourceType::unambiguous().with_jsx(true),
    }
}

pub fn with_parsed<R>(path: &str, text: &str, run: impl FnOnce(&ParsedFile) -> R) -> R {
    let allocator = Allocator::default();
    let source_type = source_type_of(path);
    let parsed = Parser::new(&allocator, text, source_type)
        .with_options(ParseOptions { preserve_parens: true, allow_return_outside_function: true, ..ParseOptions::default() })
        .parse();
    let program = allocator.alloc(parsed.program);
    let file = ParsedFile {
        path,
        text,
        source_type,
        program,
        lines: lines::LineTable::of(text),
        panicked: parsed.fatal_error,
        errors: parsed.diagnostics.iter().map(|error| error.to_string()).collect(),
    };
    run(&file)
}
