//! TypeScript and JavaScript front end: one oxc parse per file, shared by every check of this language.
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

/// Like `with_parsed`, and keeps the tokens the parser lexed.
pub fn with_tokens<R>(path: &str, text: &str, run: impl FnOnce(&ParsedFile) -> R) -> R {
    parsed(path, text, true, run)
}

/// Safe nesting limit for delimiter / JSX / generic depth before calling recursive oxc passes.
/// Chosen to stay well within default 2 MiB rayon worker thread stacks across all syntax shapes.
const MAX_NESTING_DEPTH: usize = 512;
/// Safe limit for unbracketed expression / call / statement chains within a single nesting frame.
const MAX_CHAIN_DEPTH: usize = 1024;

#[derive(Clone, Copy, PartialEq, Eq)]
enum FrameKind {
    Root,
    Delimiter,
    TemplateExpr,
}

#[derive(Clone, Copy)]
struct DepthFrame {
    kind: FrameKind,
    chain: usize,
    angle: usize,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum PrevToken {
    Other,
    ExprEnd,
    Operator,
}

fn is_ident_start(b: u8) -> bool {
    b.is_ascii_alphabetic() || b == b'_' || b == b'$' || b >= 0x80
}

fn is_ident_continue(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$' || b >= 0x80
}

/// Fast O(N) iterative lexical scan that detects pathological syntax nesting or expression chains
/// before handing source text to recursive external parsers and AST visitors.
fn exceeds_safe_depth(text: &str) -> bool {
    let bytes = text.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    let mut frames = vec![DepthFrame { kind: FrameKind::Root, chain: 0, angle: 0 }];
    let mut prev = PrevToken::Other;
    let mut saw_newline = false;
    let mut jsx_depth: usize = 0;
    let mut jsx_open_frame: Option<usize> = None;
    let mut in_jsx_close_tag = false;
    let mut in_template = false;

    while i < len {
        if in_template {
            match bytes[i] {
                b'\\' => i = (i + 2).min(len),
                b'`' => {
                    in_template = false;
                    prev = PrevToken::ExprEnd;
                    i += 1;
                }
                b'$' if i + 1 < len && bytes[i + 1] == b'{' => {
                    if frames.len() >= MAX_NESTING_DEPTH {
                        return true;
                    }
                    frames.push(DepthFrame { kind: FrameKind::TemplateExpr, chain: 0, angle: 0 });
                    in_template = false;
                    prev = PrevToken::Other;
                    saw_newline = false;
                    i += 2;
                }
                _ => i += 1,
            }
            continue;
        }

        let b = bytes[i];

        // Whitespace
        if matches!(b, b' ' | b'\t' | b'\r' | b'\x0c') {
            i += 1;
            continue;
        }
        if b == b'\n' {
            saw_newline = true;
            i += 1;
            continue;
        }

        // Line comment
        if b == b'/' && i + 1 < len && bytes[i + 1] == b'/' {
            i += 2;
            while i < len && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }

        // Block comment
        if b == b'/' && i + 1 < len && bytes[i + 1] == b'*' {
            i += 2;
            while i + 1 < len && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                if bytes[i] == b'\n' {
                    saw_newline = true;
                }
                i += 1;
            }
            i = (i + 2).min(len);
            continue;
        }

        // String literal
        if b == b'\'' || b == b'"' {
            if saw_newline && prev == PrevToken::ExprEnd {
                let top = frames.last_mut().expect("root frame");
                top.chain = 0;
                top.angle = 0;
            }
            saw_newline = false;
            let quote = b;
            i += 1;
            while i < len && bytes[i] != quote && bytes[i] != b'\n' {
                if bytes[i] == b'\\' {
                    i += 2;
                } else {
                    i += 1;
                }
            }
            if i < len && bytes[i] == quote {
                i += 1;
            }
            prev = PrevToken::ExprEnd;
            continue;
        }

        // Template literal start
        if b == b'`' {
            if saw_newline && prev == PrevToken::ExprEnd {
                let top = frames.last_mut().expect("root frame");
                top.chain = 0;
                top.angle = 0;
            }
            saw_newline = false;
            in_template = true;
            i += 1;
            continue;
        }

        // Regex literal (when `/` follows non-expression-ending token and not `/>`)
        let at_jsx_self_close = jsx_open_frame == Some(frames.len()) && i + 1 < len && bytes[i + 1] == b'>';
        if b == b'/' && prev != PrevToken::ExprEnd && !at_jsx_self_close {
            saw_newline = false;
            i += 1;
            let mut in_class = false;
            while i < len && bytes[i] != b'\n' {
                match bytes[i] {
                    b'\\' => i += 2,
                    b'[' => {
                        in_class = true;
                        i += 1;
                    }
                    b']' => {
                        in_class = false;
                        i += 1;
                    }
                    b'/' if !in_class => {
                        i += 1;
                        while i < len && bytes[i].is_ascii_alphabetic() {
                            i += 1;
                        }
                        break;
                    }
                    _ => i += 1,
                }
            }
            prev = PrevToken::ExprEnd;
            continue;
        }

        // Identifiers and keywords
        if is_ident_start(b) {
            let start = i;
            i += 1;
            while i < len && is_ident_continue(bytes[i]) {
                i += 1;
            }
            let word = &bytes[start..i];
            let is_continuation_kw = matches!(word, b"as" | b"satisfies" | b"in" | b"instanceof");
            if saw_newline && prev == PrevToken::ExprEnd && !is_continuation_kw {
                let top = frames.last_mut().expect("root frame");
                top.chain = 0;
                top.angle = 0;
            }
            saw_newline = false;

            let top = frames.last_mut().expect("root frame");
            if matches!(
                word,
                b"const"
                    | b"let"
                    | b"var"
                    | b"function"
                    | b"class"
                    | b"import"
                    | b"export"
                    | b"type"
                    | b"interface"
                    | b"enum"
                    | b"switch"
                    | b"try"
                    | b"catch"
                    | b"finally"
                    | b"case"
                    | b"default"
                    | b"break"
                    | b"continue"
                    | b"return"
                    | b"throw"
            ) {
                top.chain = 0;
                top.angle = 0;
                prev = PrevToken::Other;
            } else if matches!(
                word,
                b"if"
                    | b"else"
                    | b"while"
                    | b"for"
                    | b"with"
                    | b"do"
                    | b"await"
                    | b"typeof"
                    | b"void"
                    | b"delete"
                    | b"yield"
                    | b"new"
                    | b"as"
                    | b"satisfies"
                    | b"in"
                    | b"instanceof"
                    | b"keyof"
                    | b"readonly"
                    | b"infer"
            ) {
                top.chain += 1;
                if top.chain > MAX_CHAIN_DEPTH {
                    return true;
                }
                prev = PrevToken::Operator;
            } else {
                prev = PrevToken::ExprEnd;
            }
            continue;
        }

        // Numeric literal
        if b.is_ascii_digit() {
            if saw_newline && prev == PrevToken::ExprEnd {
                let top = frames.last_mut().expect("root frame");
                top.chain = 0;
                top.angle = 0;
            }
            saw_newline = false;
            i += 1;
            while i < len && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_' || bytes[i] == b'.') {
                i += 1;
            }
            prev = PrevToken::ExprEnd;
            continue;
        }

        // Punctuation and operators
        match b {
            b';' | b',' => {
                saw_newline = false;
                let top = frames.last_mut().expect("root frame");
                top.chain = 0;
                if b == b';' {
                    top.angle = 0;
                }
                prev = PrevToken::Other;
                i += 1;
            }
            b'{' | b'(' | b'[' => {
                let is_call_or_index = (b == b'(' || b == b'[') && prev == PrevToken::ExprEnd;
                if saw_newline && prev == PrevToken::ExprEnd && !is_call_or_index {
                    let top = frames.last_mut().expect("root frame");
                    top.chain = 0;
                    top.angle = 0;
                }
                saw_newline = false;
                if is_call_or_index {
                    let top = frames.last_mut().expect("root frame");
                    top.chain += 1;
                    if top.chain > MAX_CHAIN_DEPTH {
                        return true;
                    }
                }
                if frames.len() >= MAX_NESTING_DEPTH {
                    return true;
                }
                frames.push(DepthFrame { kind: FrameKind::Delimiter, chain: 0, angle: 0 });
                prev = PrevToken::Other;
                i += 1;
            }
            b'}' | b')' | b']' => {
                saw_newline = false;
                if frames.len() > 1 {
                    let popped = frames.pop().expect("non-root frame");
                    if b == b'}' && popped.kind == FrameKind::TemplateExpr {
                        in_template = true;
                        prev = PrevToken::Other;
                        i += 1;
                        continue;
                    }
                }
                if b == b'}' {
                    let top = frames.last_mut().expect("root frame");
                    top.angle = 0;
                }
                prev = PrevToken::ExprEnd;
                i += 1;
            }
            b'.' => {
                saw_newline = false;
                if i + 2 < len && bytes[i + 1] == b'.' && bytes[i + 2] == b'.' {
                    prev = PrevToken::Operator;
                    i += 3;
                } else {
                    let top = frames.last_mut().expect("root frame");
                    top.chain += 1;
                    if top.chain > MAX_CHAIN_DEPTH {
                        return true;
                    }
                    prev = PrevToken::Operator;
                    i += 1;
                }
            }
            b'<' => {
                saw_newline = false;
                if i + 1 < len && bytes[i + 1] == b'/' {
                    jsx_depth = jsx_depth.saturating_sub(1);
                    in_jsx_close_tag = true;
                    prev = PrevToken::Other;
                    i += 2;
                } else if i + 1 < len && (bytes[i + 1] == b'=' || bytes[i + 1] == b'<') {
                    let top = frames.last_mut().expect("root frame");
                    top.chain += 1;
                    if top.chain > MAX_CHAIN_DEPTH {
                        return true;
                    }
                    prev = PrevToken::Operator;
                    i += 2;
                } else if prev != PrevToken::ExprEnd
                    && i + 1 < len
                    && (bytes[i + 1].is_ascii_alphabetic() || bytes[i + 1] == b'_' || bytes[i + 1] == b'$' || bytes[i + 1] == b'>')
                {
                    jsx_open_frame = Some(frames.len());
                    prev = PrevToken::Other;
                    i += 1;
                } else {
                    let top = frames.last_mut().expect("root frame");
                    top.angle += 1;
                    top.chain += 1;
                    if top.angle > MAX_NESTING_DEPTH || top.chain > MAX_CHAIN_DEPTH {
                        return true;
                    }
                    prev = PrevToken::Operator;
                    i += 1;
                }
            }
            b'/' if at_jsx_self_close => {
                saw_newline = false;
                jsx_open_frame = None;
                prev = PrevToken::ExprEnd;
                i += 2;
            }
            b'>' => {
                saw_newline = false;
                if jsx_open_frame == Some(frames.len()) {
                    jsx_open_frame = None;
                    jsx_depth += 1;
                    if jsx_depth > MAX_NESTING_DEPTH {
                        return true;
                    }
                    prev = PrevToken::Other;
                } else if in_jsx_close_tag {
                    in_jsx_close_tag = false;
                    prev = PrevToken::ExprEnd;
                } else {
                    let top = frames.last_mut().expect("root frame");
                    top.angle = top.angle.saturating_sub(1);
                    prev = PrevToken::Operator;
                }
                i += 1;
            }
            b'=' if i + 1 < len && bytes[i + 1] == b'>' => {
                saw_newline = false;
                let top = frames.last_mut().expect("root frame");
                top.chain += 1;
                if top.chain > MAX_CHAIN_DEPTH {
                    return true;
                }
                prev = PrevToken::Operator;
                i += 2;
            }
            b'?' if i + 1 < len && bytes[i + 1] == b'.' => {
                saw_newline = false;
                let top = frames.last_mut().expect("root frame");
                top.chain += 1;
                if top.chain > MAX_CHAIN_DEPTH {
                    return true;
                }
                prev = PrevToken::Operator;
                i += 2;
            }
            b'+' | b'-' | b'*' | b'/' | b'%' | b'&' | b'|' | b'^' | b'?' | b'=' | b'!' | b'~' => {
                saw_newline = false;
                let top = frames.last_mut().expect("root frame");
                top.chain += 1;
                if top.chain > MAX_CHAIN_DEPTH {
                    return true;
                }
                // Consume multi-character operator sequences as a single operator,
                // except `!` and `~` which can repeat as unary chains (`!!!a`, `~~~a`).
                if b == b'!' || b == b'~' {
                    if b == b'!' && i + 1 < len && bytes[i + 1] == b'=' {
                        i += 2;
                        if i < len && bytes[i] == b'=' {
                            i += 1;
                        }
                    } else {
                        i += 1;
                    }
                } else {
                    i += 1;
                    while i < len && matches!(bytes[i], b'=' | b'&' | b'|' | b'?' | b'+' | b'-' | b'*') && bytes[i] == b || (i < len && bytes[i] == b'=') {
                        i += 1;
                    }
                }
                prev = PrevToken::Operator;
            }
            _ => {
                saw_newline = false;
                prev = PrevToken::Other;
                i += 1;
            }
        }
    }
    false
}

fn parsed<R>(path: &str, text: &str, tokens: bool, run: impl FnOnce(&ParsedFile) -> R) -> R {
    let allocator = Allocator::default();
    let source_type = source_type_of(path);
    if exceeds_safe_depth(text) {
        let parsed = Parser::new(&allocator, "", source_type).parse();
        let tokens: &[Token] = allocator.alloc(parsed.tokens);
        let program = allocator.alloc(parsed.program);
        let file = ParsedFile {
            path,
            text,
            source_type,
            program,
            lines: lines::LineTable::of(text),
            tokens,
            halves: strings::Halves::of(text),
            panicked: true,
            errors: vec!["syntax nesting exceeds safe depth limit".to_string()],
        };
        return run(&file);
    }
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
