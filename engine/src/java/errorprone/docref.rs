//! Whether javac's `ReferenceParser` accepts the reference of a `@see`, `@link` or `@throws`.

#[derive(Clone, PartialEq, Debug)]
enum Token {
    Name(String),
    Sign(char),
}

const RESERVED: &[&str] = &[
    "abstract", "assert", "break", "case", "catch", "class", "const", "continue", "default", "do", "else", "enum", "extends", "final", "finally",
    "for", "goto", "if", "implements", "import", "instanceof", "interface", "native", "new", "package", "private", "protected", "public",
    "return", "static", "strictfp", "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "volatile", "while",
    "true", "false", "null", "_",
];
const PRIMITIVES: &[&str] = &["boolean", "byte", "char", "short", "int", "long", "float", "double", "void"];

fn tokens(text: &str) -> Option<Vec<Token>> {
    let letters: Vec<char> = text.chars().collect();
    let mut found = Vec::new();
    let mut at = 0;
    while at < letters.len() {
        let letter = letters[at];
        if letter.is_whitespace() {
            at += 1;
        } else if letter.is_alphabetic() || matches!(letter, '_' | '$') {
            let end = (at..letters.len()).find(|place| !(letters[*place].is_alphanumeric() || matches!(letters[*place], '_' | '$'))).unwrap_or(letters.len());
            found.push(Token::Name(letters[at..end].iter().collect()));
            at = end;
        } else if matches!(letter, '.' | '<' | '>' | ',' | '?' | '[' | ']' | '&') {
            found.push(Token::Sign(letter));
            at += 1;
        } else {
            return None;
        }
    }
    Some(found)
}

struct Reader {
    tokens: Vec<Token>,
    at: usize,
}

impl Reader {
    fn sign(&mut self, wanted: char) -> bool {
        let found = self.tokens.get(self.at) == Some(&Token::Sign(wanted));
        self.at += usize::from(found);
        found
    }
    fn name(&mut self) -> Option<String> {
        match self.tokens.get(self.at) {
            Some(Token::Name(name)) => {
                self.at += 1;
                Some(name.clone())
            }
            _ => None,
        }
    }
    fn identifier(&mut self) -> bool {
        self.name().is_some_and(|name| !RESERVED.contains(&name.as_str()) && !PRIMITIVES.contains(&name.as_str()))
    }
    fn arguments(&mut self) -> bool {
        loop {
            if self.sign('?') {
                let bounded = matches!(self.tokens.get(self.at), Some(Token::Name(word)) if word == "extends" || word == "super");
                if bounded {
                    self.at += 1;
                    if !self.kind() {
                        return false;
                    }
                }
            } else if !self.kind() {
                return false;
            }
            if !self.sign(',') {
                return self.sign('>');
            }
        }
    }
    /// A type: a primitive or a qualified name with type arguments, then array brackets.
    fn kind(&mut self) -> bool {
        let Some(first) = self.name() else { return false };
        if RESERVED.contains(&first.as_str()) {
            return false;
        }
        if !PRIMITIVES.contains(&first.as_str()) {
            loop {
                if self.sign('<') && !self.arguments() {
                    return false;
                }
                if !self.sign('.') {
                    break;
                }
                if !self.identifier() {
                    return false;
                }
            }
        }
        while self.sign('[') {
            if !self.sign(']') {
                return false;
            }
        }
        true
    }
    fn done(&self) -> bool {
        self.at == self.tokens.len()
    }
}

fn reader(text: &str) -> Option<Reader> {
    tokens(text).map(|tokens| Reader { tokens, at: 0 })
}

fn type_ok(text: &str) -> bool {
    reader(text).is_some_and(|mut reader| reader.kind() && reader.done())
}

fn member_ok(text: &str) -> bool {
    reader(text).is_some_and(|mut reader| reader.identifier() && reader.done())
}

fn module_ok(text: &str) -> bool {
    reader(text).is_some_and(|mut reader| {
        if !reader.identifier() {
            return false;
        }
        while reader.sign('.') {
            if !reader.identifier() {
                return false;
            }
        }
        reader.done()
    })
}

fn parameters_ok(text: &str) -> bool {
    if text.trim().is_empty() {
        return true;
    }
    reader(&text.replace("...", "[]")).is_some_and(|mut reader| {
        loop {
            if !reader.kind() {
                return false;
            }
            let named = matches!(reader.tokens.get(reader.at), Some(Token::Name(name)) if !RESERVED.contains(&name.as_str()));
            reader.at += usize::from(named);
            if !reader.sign(',') {
                return reader.done();
            }
        }
    })
}

/// `ReferenceParser.parse` for the three modes: a member is required, optional or not allowed.
pub fn reference_ok(signature: &str, required: bool, disallowed: bool, optional: bool) -> bool {
    let slash = signature.find('/');
    let after_slash = slash.map_or(0, |slash| slash + 1);
    let hash = signature[after_slash..].find('#').map(|hash| hash + after_slash);
    let after_hash = hash.map_or(0, |hash| hash + 1);
    let from = slash.max(hash).map_or(0, |last| last + 1);
    let paren = signature[from..].find('(').map(|paren| paren + from);
    match slash {
        Some(0) => return false,
        Some(slash) if !module_ok(&signature[..slash]) => return false,
        _ => {}
    }
    let member_end = paren.unwrap_or(signature.len());
    if slash.is_some() && signature.len() == after_slash {
    } else if let Some(hash) = hash {
        if disallowed || (hash != after_slash && !type_ok(&signature[after_slash..hash])) {
            return false;
        }
        if signature[after_hash..].starts_with('#') {
            if !optional {
                return false;
            }
        } else if !member_ok(&signature[after_hash..member_end.max(after_hash)]) {
            return false;
        }
    } else if paren.is_none() && !required {
        if !type_ok(&signature[after_slash..]) {
            return false;
        }
    } else if disallowed || !member_ok(&signature[after_slash..member_end]) {
        return false;
    }
    match paren {
        None => true,
        Some(paren) => {
            let close = signature[paren..].find(')').map(|close| close + paren);
            close == Some(signature.len() - 1) && parameters_ok(&signature[paren + 1..signature.len() - 1])
        }
    }
}
