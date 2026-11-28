//! TypeScript and JavaScript front end: one oxc parse per file, shared by every check of this language.
pub mod imports;
pub mod lines;
pub mod resolve;
pub mod rules;
pub mod strings;
pub mod tokens;
pub mod structure;
pub mod tree;
pub mod typed;
pub mod types;

use oxc_allocator::Allocator;
use oxc_ast::ast::Program;
use oxc_parser::config::TokensParserConfig;
use oxc_parser::{ParseOptions, Parser, Token};
use oxc_span::SourceType;

pub const EXTENSIONS: &[&str] = &["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"];

/// One parsed file. The allocator that owns the tree lives as long as the closure given to `with_parsed`.
pub struct ParsedFile<'a> {
    pub path: &'a str,
    pub text: &'a str,
    pub source_type: SourceType,
    pub program: &'a Program<'a>,
    pub lines: lines::LineTable,
    /// Lexed tokens in source order; empty unless the file was parsed with `with_tokens`.
    pub tokens: &'a [Token],
    /// How this file's string values keep lone surrogate halves.
    pub halves: strings::Halves,
    /// The parser gave up, reported an error that leaves no usable tree, or reads the file another way than the
    /// compiler does. The Node analyzer has to read such a file.
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
    parsed(path, text, false, run)
}

/// Like `with_parsed`, reading the file as a module whatever its extension says.
pub fn with_parsed_module<R>(path: &str, text: &str, run: impl FnOnce(&ParsedFile) -> R) -> R {
    parsed_as(path, text, false, source_type_of(path).with_module(true), run)
}

/// Like `with_parsed`, and keeps the tokens the parser lexed.
pub fn with_tokens<R>(path: &str, text: &str, run: impl FnOnce(&ParsedFile) -> R) -> R {
    parsed(path, text, true, run)
}

fn parsed<R>(path: &str, text: &str, tokens: bool, run: impl FnOnce(&ParsedFile) -> R) -> R {
    parsed_as(path, text, tokens, source_type_of(path), run)
}

fn parsed_as<R>(path: &str, text: &str, tokens: bool, source_type: SourceType, run: impl FnOnce(&ParsedFile) -> R) -> R {
    let allocator = Allocator::default();
    let options = ParseOptions { preserve_parens: true, allow_return_outside_function: true, ..ParseOptions::default() };
    let parsed = if tokens {
        Parser::new(&allocator, text, source_type).with_options(options).with_config(TokensParserConfig).parse()
    } else {
        Parser::new(&allocator, text, source_type).with_options(options).parse()
    };
    let html_comment = parsed.program.comments.iter().any(|comment| {
        let written = &text[comment.span.start as usize..];
        written.starts_with("<!--") || written.starts_with("-->")
    });
    let panicked = parsed.fatal_error || html_comment;
    let mut errors: Vec<String> = parsed.diagnostics.iter().map(|error| error.to_string()).collect();
    if html_comment {
        errors.push("HTML-like comment".to_string());
    }
    let tokens: &[Token] = allocator.alloc(parsed.tokens);
    let program = allocator.alloc(parsed.program);
    let file = ParsedFile { path, text, source_type, program, lines: lines::LineTable::of(text), tokens, halves: strings::Halves::of(text), panicked, errors };
    run(&file)
}
