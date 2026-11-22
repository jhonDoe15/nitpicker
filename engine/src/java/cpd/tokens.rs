//! One file's CPD tokens, as nitpicker's CPD step makes them: `.class` overwritten with `const` first (so a class
//! literal does not open a type for the constructor detector), then PMD's Java CPD lexer with literals and
//! identifiers anonymized: package and import statements, semicolons, `CPD-OFF` ... `CPD-ON` comments and
//! `@SuppressWarnings("CPD-START")` ... `"CPD-END"` dropped, a constructor's name kept.
use super::lexer::{lex, Kind, Lexed, Token};
use super::text::{normalized, translated, Lines, Translated};

pub struct Entry {
    /// Index into `FileTokens::requests`.
    pub image: u32,
    pub begin: (u32, u32),
    pub end: (u32, u32),
}

pub struct FileTokens {
    pub entries: Vec<Entry>,
    /// Every image the file asks an id for, in order, as an index into `names`; an entry points at the last
    /// request made for it.
    pub requests: Vec<u32>,
    pub names: Vec<String>,
    known: std::collections::HashMap<String, u32>,
}

impl FileTokens {
    fn ask(&mut self, image: String) -> u32 {
        let next = self.names.len() as u32;
        let name = *self.known.entry(image).or_insert_with_key(|image| {
            self.names.push(image.clone());
            next
        });
        self.requests.push(name);
        self.requests.len() as u32 - 1
    }

    pub fn image(&self, entry: &Entry) -> &str {
        &self.names[self.requests[entry.image as usize] as usize]
    }
}

fn image(text: &[u16], token: &Token) -> String {
    String::from_utf16_lossy(&text[token.start..token.end])
}

fn is_operator(text: &[u16], token: &Token, operator: &str) -> bool {
    token.kind == Kind::Operator && text[token.start..token.end].iter().copied().eq(operator.encode_utf16())
}

fn is_keyword(text: &[u16], token: &Token, word: &str) -> bool {
    token.kind == Kind::Keyword && text[token.start..token.end].iter().copied().eq(word.encode_utf16())
}

/// The file text with each `.class` overwritten by `const` and spaces, as `CpdReport.lexable` does.
fn without_class_literals(mut text: Vec<u16>) -> Option<Vec<u16>> {
    let mut translation = translated(&text)?;
    let lexed = lex(&translation.text)?;
    let mut starts = Vec::new();
    for pair in lexed.tokens.windows(2) {
        if is_keyword(&translation.text, &pair[1], "class") && is_operator(&translation.text, &pair[0], ".") {
            starts.push(translation.to_input(pair[1].start, true));
        }
    }
    for start in starts {
        let mut end = start;
        for _ in 0..5 {
            end = next_java_char(&text, end);
        }
        let replacement: Vec<u16> = "const".encode_utf16().chain(std::iter::repeat_n(u16::from(b' '), end - start - 5)).collect();
        text.splice(start..end, replacement);
    }
    Some(text)
}

fn next_java_char(text: &[u16], index: usize) -> usize {
    if text[index] != u16::from(b'\\') || index + 1 >= text.len() || text[index + 1] != u16::from(b'u') {
        return index + 1;
    }
    let mut hex = index + 1;
    while text[hex] == u16::from(b'u') {
        hex += 1;
    }
    hex + 4
}

/// `None` when PMD would not tokenize the file as a whole (bad escape, lexical error, a failure in its
/// constructor detector): the caller then leaves the module to CPD.
pub fn file_tokens(source: &str, detector: Detector) -> Option<(FileTokens, Detector)> {
    let text = without_class_literals(normalized(source))?;
    let lines = Lines::new(&text);
    let mut translation = translated(&text)?;
    let lexed = lex(&translation.text)?;
    Filter { detector, ..Filter::default() }.run(&lexed, &mut translation, &lines)
}

#[derive(Default)]
struct Filter {
    in_annotation: bool,
    annotation_ends: bool,
    parentheses: i32,
    semicolon: bool,
    package_or_import: bool,
    cpd_start: bool,
    cpd_off: bool,
    detector: Detector,
    failed: bool,
}

/// `ConstructorDetector`'s state. PMD keeps one detector for all files of a run, so a file that leaves a type open
/// hands it to the next file.
#[derive(Clone, Default, PartialEq)]
pub struct Detector {
    types: Vec<(i32, Option<String>)>,
    depth: i32,
    store_name: bool,
    last_identifier: Option<String>,
}

impl Detector {
    /// Whether a file starting from this state tokenizes as from a fresh one: with no type open, only the brace
    /// depth differs, and the detector compares depths with each other only.
    pub fn is_fresh(&self) -> bool {
        self.types.is_empty() && !self.store_name
    }

    /// The state after a file that started fresh, when it starts from `self` instead (`self` fresh).
    pub fn then(&self, end: &Detector) -> Detector {
        Detector {
            types: end.types.iter().map(|(depth, name)| (depth + self.depth, name.clone())).collect(),
            depth: end.depth + self.depth,
            store_name: end.store_name,
            last_identifier: end.last_identifier.clone().or_else(|| self.last_identifier.clone()),
        }
    }
}

impl Filter {
    fn run(mut self, lexed: &Lexed, translation: &mut Translated, lines: &Lines) -> Option<(FileTokens, Detector)> {
        let text = translation.text.clone();
        let mut out = FileTokens { entries: Vec::new(), requests: Vec::new(), names: Vec::new(), known: Default::default() };
        for token in &lexed.tokens {
            for comment in &lexed.comments[token.comments.clone()] {
                if comment.single_line && contains(&text[comment.start..comment.end], "NOPMD") {
                    translation.to_input(comment.start, true);
                    translation.to_input(comment.end, false);
                }
            }
            self.analyze(&text, token);
            for comment in lexed.comments[token.comments.clone()].iter().rev() {
                let body = &text[comment.start..comment.end];
                if contains(body, "CPD-OFF") {
                    self.cpd_off = true;
                    break;
                }
                if contains(body, "CPD-ON") {
                    self.cpd_off = false;
                    break;
                }
            }
            if self.cpd_off || self.semicolon || self.package_or_import || self.cpd_start {
                continue;
            }
            self.record(&text, token, translation, lines, &mut out);
            if self.failed {
                return None;
            }
        }
        Some((out, self.detector))
    }

    fn analyze(&mut self, text: &[u16], token: &Token) {
        if self.in_annotation && self.annotation_ends {
            self.in_annotation = false;
            self.annotation_ends = false;
        }
        if self.in_annotation {
            if is_operator(text, token, "(") {
                self.parentheses += 1;
            } else if is_operator(text, token, ")") {
                self.parentheses -= 1;
                if self.parentheses == 0 {
                    self.annotation_ends = true;
                }
            } else if self.parentheses == 0 && token.kind != Kind::Identifier {
                self.in_annotation = false;
            }
        }
        if is_operator(text, token, "@") {
            self.in_annotation = true;
        }
        let semicolon = is_operator(text, token, ";");
        self.semicolon = semicolon;
        if is_keyword(text, token, "package") || is_keyword(text, token, "import") {
            self.package_or_import = true;
        } else if self.package_or_import && semicolon {
            self.package_or_import = false;
        }
        if self.in_annotation && token.kind == Kind::String {
            let literal = image(text, token);
            if !self.cpd_start && literal == "\"CPD-START\"" {
                self.cpd_start = true;
            } else if self.cpd_start && literal == "\"CPD-END\"" {
                self.cpd_start = false;
            }
        }
    }

    fn record(&mut self, text: &[u16], token: &Token, translation: &mut Translated, lines: &Lines, out: &mut FileTokens) {
        if is_operator(text, token, "(") {
            if let Some((_, name)) = self.detector.types.last() {
                let Some(name) = name else {
                    self.failed = true;
                    return;
                };
                if self.detector.last_identifier.as_ref() == Some(name) {
                    if out.entries.is_empty() {
                        self.failed = true;
                        return;
                    }
                    let asked = out.ask(name.clone());
                    if let Some(last) = out.entries.last_mut() {
                        last.image = asked;
                    }
                }
            }
        }
        let raw = image(text, token);
        let shown = match token.kind {
            Kind::String => "<STRING_LITERAL>".to_string(),
            Kind::Character => "<CHARACTER_LITERAL>".to_string(),
            Kind::Integer => "<INTEGER_LITERAL>".to_string(),
            Kind::Float => "<FLOATING_POINT_LITERAL>".to_string(),
            Kind::Identifier => "<IDENTIFIER>".to_string(),
            Kind::Operator if raw == ">>" || raw == ">>>" => ">".to_string(),
            _ => raw.clone(),
        };
        self.detect(token, text, raw);
        let start = translation.to_input(token.start, true);
        let end = translation.to_input(token.end, false);
        let image = out.ask(shown);
        out.entries.push(Entry { image, begin: lines.position(start, true), end: lines.position(end, false) });
    }

    fn detect(&mut self, token: &Token, text: &[u16], raw: String) {
        if token.kind == Kind::Identifier {
            if raw == "enum" {
                self.open_type();
            } else if self.detector.store_name {
                if let Some(top) = self.detector.types.last_mut() {
                    top.1 = Some(raw.clone());
                }
                self.detector.store_name = false;
            }
            self.detector.last_identifier = Some(raw);
        } else if is_keyword(text, token, "class") {
            self.open_type();
        } else if is_operator(text, token, "{") {
            self.detector.depth += 1;
        } else if is_operator(text, token, "}") {
            if self.detector.types.last().is_some_and(|top| top.0 == self.detector.depth) {
                self.detector.types.pop();
            }
            self.detector.depth -= 1;
        } else if self.detector.store_name {
            self.detector.types.pop();
            self.detector.store_name = false;
        }
    }

    fn open_type(&mut self) {
        self.detector.types.push((self.detector.depth + 1, None));
        self.detector.store_name = true;
    }
}

fn contains(text: &[u16], needle: &str) -> bool {
    let needle: Vec<u16> = needle.encode_utf16().collect();
    text.windows(needle.len()).any(|window| window == needle.as_slice())
}
