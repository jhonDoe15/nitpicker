//! References in doc comments: `module/package.Type#member(parameters)` and `Type##fragment`, as the
//! specification's References section gives them. A reference that does not have that form is an error.
use super::doc::{Kind, Tree, is_space};
use super::docparse::{Parser, java_part, java_start};

/// What a tag accepts as its reference.
#[derive(Clone, Copy, PartialEq)]
pub enum Form {
    /// Anything the general form allows: `@see`, `{@link}`, `{@value}`.
    Full,
    /// A type alone: `@throws`, `@provides`, `@uses`, the type of `@serialField`.
    Type,
}

const SYNTAX: &str = "dc.ref.syntax.error";
const UNEXPECTED: &str = "dc.ref.unexpected.input";

const PRIMITIVES: &[&str] = &["boolean", "byte", "char", "double", "float", "int", "long", "short", "void"];
/// Words that are never a name, and the names a type may not have.
const RESERVED: &[&str] = &[
    "abstract", "break", "case", "catch", "class", "const", "continue", "default", "do", "else", "extends", "false", "final", "finally", "for", "goto",
    "if", "implements", "import", "instanceof", "interface", "native", "new", "null", "package", "private", "protected", "public", "return", "static",
    "strictfp", "super", "switch", "synchronized", "this", "throw", "throws", "transient", "true", "try", "volatile", "while",
];
const NO_TYPE: &[&str] = &["_", "assert", "enum", "permits", "record", "sealed", "var", "yield"];

impl Parser<'_> {
    /// Reads a reference: up to whitespace outside parentheses and angle brackets, or a closing brace.
    pub fn reference(&mut self, form: Form) -> Result<Tree, &'static str> {
        let from = self.at;
        let mut depth = 0i32;
        while let Some(character) = self.peek() {
            let ends = match character {
                '}' => true,
                '@' => self.line_start,
                other => is_space(other) && depth == 0,
            };
            if ends {
                break;
            }
            depth += i32::from(matches!(character, '(' | '<')) - i32::from(matches!(character, ')' | '>'));
            self.line_start = character == '\n' || (self.line_start && is_space(character));
            self.at += 1;
        }
        let written: Vec<char> = self.text[from..self.at].to_vec();
        if written.is_empty() {
            return Err(SYNTAX);
        }
        if depth > 0 {
            return Err("dc.unterminated.signature");
        }
        check(&written, form)?;
        Ok(Tree::leaf(Kind::Reference, written.iter().collect(), from, self.at))
    }
}

/// `module/Type`, `module/` or `Type`.
fn qualified(written: &[char]) -> Result<(), &'static str> {
    let Some(slash) = written.iter().position(|character| *character == '/') else { return whole_type(written) };
    let module: String = written[..slash].iter().collect();
    if module.is_empty() || module.strip_suffix('.').is_some_and(|rest| rest.split('.').all(identifier)) {
        return Err(SYNTAX);
    }
    if !module.split('.').all(identifier) {
        return Err(UNEXPECTED);
    }
    if written[slash + 1..].is_empty() { Ok(()) } else { whole_type(&written[slash + 1..]) }
}

fn check(written: &[char], form: Form) -> Result<(), &'static str> {
    if form == Form::Type {
        return qualified(written);
    }
    let mut depth = 0i32;
    for (at, character) in written.iter().enumerate() {
        depth += i32::from(*character == '(') - i32::from(*character == ')');
        if *character == ')' && depth == 0 && at + 1 < written.len() {
            return Err("dc.ref.bad.parens");
        }
    }
    let hash = written.iter().position(|character| *character == '#');
    let (qualifier, member) = match hash {
        Some(at) if written.get(at + 1) == Some(&'#') => (&written[..at], None),
        Some(at) => (&written[..at], Some(&written[at + 1..])),
        None if written.contains(&'(') => (&written[..0], Some(written)),
        None => (written, None),
    };
    if !qualifier.is_empty() {
        qualified(qualifier)?;
    }
    let Some(member) = member else { return Ok(()) };
    let open = member.iter().position(|character| *character == '(').unwrap_or(member.len());
    let name: String = member[..open].iter().collect();
    if name.is_empty() || name == "_" {
        return Err(SYNTAX);
    }
    if !identifier(&name) {
        return Err(UNEXPECTED);
    }
    if open == member.len() {
        return Ok(());
    }
    parameters(&member[open + 1..member.len() - 1])
}

fn identifier(name: &str) -> bool {
    let mut characters = name.chars();
    characters.next().is_some_and(java_start)
        && characters.all(java_part)
        && !RESERVED.contains(&name)
        && !PRIMITIVES.contains(&name)
        && !matches!(name, "assert" | "enum")
}

/// `Type`, `Type name`, `Type...` or `Type... name`, separated by commas.
fn parameters(list: &[char]) -> Result<(), &'static str> {
    if list.iter().all(|character| is_space(*character)) {
        return Ok(());
    }
    let mut depth = 0i32;
    let mut from = 0usize;
    for at in 0..=list.len() {
        let character = list.get(at).copied().unwrap_or(',');
        depth += i32::from(character == '<') - i32::from(character == '>');
        if character != ',' || (depth > 0 && at < list.len()) {
            continue;
        }
        let mut reader = Reader { text: &list[from..at], at: 0 };
        from = at + 1;
        reader.skip_space();
        match reader.peek() {
            None => return Err(SYNTAX),
            Some('@') => return Err("dc.ref.annotations.not.allowed"),
            Some(_) => {}
        }
        reader.kind(true)?;
        reader.skip_space();
        if reader.text[reader.at..].starts_with(&['.', '.', '.']) {
            reader.at += 3;
            reader.skip_space();
        }
        if let Some(name) = reader.word() {
            if !identifier(&name) {
                return Err(UNEXPECTED);
            }
        }
        reader.skip_space();
        if reader.peek().is_some() {
            return Err(UNEXPECTED);
        }
    }
    Ok(())
}

fn whole_type(written: &[char]) -> Result<(), &'static str> {
    let mut reader = Reader { text: written, at: 0 };
    reader.kind(true)?;
    if reader.peek() == Some('@') {
        return Err(reader.annotation());
    }
    if reader.peek().is_some() { Err(UNEXPECTED) } else { Ok(()) }
}

/// Reads a type as Java writes one: a qualified name with type arguments, or a primitive, then array brackets.
struct Reader<'t> {
    text: &'t [char],
    at: usize,
}

impl Reader<'_> {
    fn peek(&self) -> Option<char> {
        self.text.get(self.at).copied()
    }

    fn skip_space(&mut self) {
        while self.peek().is_some_and(is_space) {
            self.at += 1;
        }
    }

    fn word(&mut self) -> Option<String> {
        let from = self.at;
        if !self.peek().is_some_and(java_start) {
            return None;
        }
        while self.peek().is_some_and(java_part) {
            self.at += 1;
        }
        Some(self.text[from..self.at].iter().collect())
    }

    /// The code for `@` where a type is read: an annotation is a syntax error when it is all that is left.
    fn annotation(&mut self) -> &'static str {
        self.at += 1;
        let mut named = self.word().is_none_or(|name| identifier(&name));
        while named && self.peek() == Some('.') {
            self.at += 1;
            named = self.word().is_some_and(|name| identifier(&name));
        }
        if named && self.peek().is_none() { SYNTAX } else { UNEXPECTED }
    }

    /// The code for something that is not a name where one must be: the input ending or closing early is a
    /// syntax error, anything else is unexpected input.
    fn missing(&self, outermost: bool) -> &'static str {
        match self.peek() {
            None => SYNTAX,
            Some(',' | '>') if !outermost => SYNTAX,
            Some(_) => UNEXPECTED,
        }
    }

    fn kind(&mut self, outermost: bool) -> Result<(), &'static str> {
        self.skip_space();
        if outermost && self.peek() == Some('<') {
            self.arguments()?;
            return Err(if self.peek().is_none() { SYNTAX } else { UNEXPECTED });
        }
        if outermost && self.peek() == Some('@') {
            return Err(self.annotation());
        }
        let Some(first) = self.word() else { return Err(self.missing(outermost)) };
        if matches!(first.as_str(), "_" | "assert" | "enum") || (NO_TYPE.contains(&first.as_str()) && self.peek() != Some('.')) {
            return Err(SYNTAX);
        }
        if RESERVED.contains(&first.as_str()) {
            return Err(UNEXPECTED);
        }
        {
            loop {
                let named = self.at;
                self.skip_space();
                match self.peek() {
                    Some('<') if !PRIMITIVES.contains(&first.as_str()) => self.arguments()?,
                    Some('.') if self.text.get(self.at + 1) != Some(&'.') => {
                        self.at += 1;
                        match self.word() {
                            Some(word) if matches!(word.as_str(), "this" | "super" | "class" | "new") => return Err(SYNTAX),
                            Some(word) if RESERVED.contains(&word.as_str()) || PRIMITIVES.contains(&word.as_str()) => return Err(UNEXPECTED),
                            Some(_) => {}
                            None => return Err(self.missing(false)),
                        }
                    }
                    _ => {
                        self.at = named;
                        break;
                    }
                }
            }
        }
        loop {
            let named = self.at;
            self.skip_space();
            if self.peek() != Some('[') {
                self.at = named;
                return Ok(());
            }
            self.at += 1;
            self.skip_space();
            if self.peek() != Some(']') {
                return Err(self.missing(false));
            }
            self.at += 1;
        }
    }

    /// `<A, ? extends B>`.
    fn arguments(&mut self) -> Result<(), &'static str> {
        self.at += 1;
        loop {
            self.skip_space();
            if self.peek() == Some('?') {
                self.at += 1;
                self.skip_space();
                let bound = self.at;
                match self.word().as_deref() {
                    Some("extends" | "super") => self.kind(false)?,
                    _ => self.at = bound,
                }
            } else {
                self.kind(false)?;
            }
            self.skip_space();
            match self.peek() {
                Some(',') => self.at += 1,
                Some('>') => {
                    self.at += 1;
                    return Ok(());
                }
                None => return Err(SYNTAX),
                Some(_) => return Err(UNEXPECTED),
            }
        }
    }
}
