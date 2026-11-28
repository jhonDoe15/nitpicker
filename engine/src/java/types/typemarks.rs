//! Type annotations of the fields and methods of a class file (`RuntimeVisibleTypeAnnotations` and
//! `RuntimeInvisibleTypeAnnotations`): which ones NullAway takes as written on the type itself, and the parameter
//! types printed with them, the way javac prints a method whose symbol carries its type annotations.
use std::collections::HashSet;

pub const FIELD: u8 = 0x13;
pub const RESULT: u8 = 0x14;
pub const PARAMETER: u8 = 0x16;
pub const ARRAY: u8 = 0;
pub const INNER: u8 = 1;
pub const WILDCARD: u8 = 2;
pub const ARGUMENT: u8 = 3;

/// One type annotation: its target, the parameter it sits on for a parameter target, the type path, and the
/// annotation's full name.
pub struct Mark {
    pub target: u8,
    pub index: u8,
    pub path: Vec<(u8, u8)>,
    pub name: String,
}

pub fn nullable(name: &str) -> bool {
    [".Nullable", ".CheckForNull", ".ParametricNullness"].iter().any(|end| name.ends_with(end))
}

/// The non-static member classes a class file lists in `InnerClasses`, by internal name.
pub type Inner = HashSet<String>;

/// How many non-static classes a class type nests in: a type annotation path steps into each of them.
fn depth(descriptor: &[u8], inner: &Inner) -> usize {
    let Some(named) = descriptor.strip_prefix(b"L").and_then(|rest| rest.split(|byte| *byte == b';' || *byte == b'<').next()) else { return 0 };
    let text = String::from_utf8_lossy(named);
    let dollars: Vec<usize> = text.match_indices('$').map(|(at, _)| at).collect();
    (0..dollars.len()).filter(|k| inner.contains(&text[..dollars.get(k + 1).copied().unwrap_or(text.len())])).count()
}

/// Whether NullAway takes a mark as written on the type itself: its path only steps into the classes the type
/// nests in, and into all of them.
pub fn direct(mark: &Mark, descriptor: &[u8], inner: &Inner) -> bool {
    mark.path.iter().all(|(kind, _)| *kind == INNER) && mark.path.len() == depth(descriptor, inner)
}

/// Whether a mark is a type-use `@Nullable` that NullAway prints in a functional interface method's signature.
pub fn shown_nullable(mark: &Mark) -> bool {
    mark.target == PARAMETER && mark.name.rsplit('.').next() == Some("Nullable")
}

pub fn elements(mark: &Mark) -> bool {
    mark.path == [(ARRAY, 0)]
}

/// The type of each parameter and the result of a method descriptor, each as its slice of the descriptor.
pub fn descriptor_parts(descriptor: &[u8]) -> (Vec<&[u8]>, &[u8]) {
    let mut parts = Vec::new();
    let mut at = descriptor.iter().position(|byte| *byte == b'(').map_or(descriptor.len(), |open| open + 1);
    while at < descriptor.len() && descriptor[at] != b')' {
        let start = at;
        while descriptor.get(at) == Some(&b'[') {
            at += 1;
        }
        if descriptor.get(at) == Some(&b'L') {
            at += descriptor[at..].iter().position(|byte| *byte == b';').unwrap_or(descriptor.len() - at);
        }
        at += 1;
        parts.push(&descriptor[start..at.min(descriptor.len())]);
    }
    (parts, descriptor.get(at + 1..).unwrap_or_default())
}

struct Printer<'p> {
    text: &'p [u8],
    at: usize,
    marks: Vec<&'p Mark>,
    inner: &'p Inner,
}

impl Printer<'_> {
    fn names(&self, path: &[(u8, u8)]) -> String {
        self.marks.iter().filter(|mark| mark.path == path).map(|mark| format!("@{} ", mark.name)).collect()
    }

    fn word(&mut self) -> String {
        let start = self.at;
        while self.text.get(self.at).is_some_and(|byte| !b"$.<;".contains(byte)) {
            self.at += 1;
        }
        String::from_utf8_lossy(&self.text[start..self.at]).into_owned()
    }

    fn arguments(&mut self, path: &[(u8, u8)]) -> Option<String> {
        self.at += 1;
        let mut given = Vec::new();
        while *self.text.get(self.at)? != b'>' {
            let mut inside = path.to_vec();
            inside.push((ARGUMENT, u8::try_from(given.len()).ok()?));
            let wild = self.names(&inside);
            let shown = match self.text[self.at] {
                b'*' => {
                    self.at += 1;
                    format!("{wild}?")
                }
                bound @ (b'+' | b'-') => {
                    self.at += 1;
                    let word = if bound == b'+' { "extends" } else { "super" };
                    inside.push((WILDCARD, 0));
                    format!("{wild}? {word} {}", self.kind(&mut inside)?)
                }
                _ => self.kind(&mut inside)?,
            };
            given.push(shown);
        }
        self.at += 1;
        Some(format!("<{}>", given.join(",")))
    }

    fn class(&mut self, path: &[(u8, u8)]) -> Option<String> {
        let first = self.word();
        let (package, simple) = first.rsplit_once('/').map_or((String::new(), first.as_str()), |(package, simple)| (format!("{}.", package.replace('/', ".")), simple));
        let mut binary = first.clone();
        let mut segments = vec![(simple.to_string(), 0usize, String::new())];
        let mut level = 0;
        loop {
            let at_level = |level: usize| [path, &vec![(INNER, 0); level]].concat();
            match *self.text.get(self.at)? {
                b';' => {
                    self.at += 1;
                    break;
                }
                b'<' => {
                    let given = self.arguments(&at_level(level))?;
                    segments.last_mut()?.2 = given;
                }
                separator => {
                    self.at += 1;
                    let word = self.word();
                    binary = format!("{binary}${word}");
                    if separator == b'.' || self.inner.contains(&binary) {
                        level += 1;
                    }
                    segments.push((word, level, String::new()));
                }
            }
        }
        let shown: Vec<String> = segments
            .iter()
            .enumerate()
            .map(|(at, (word, level, given))| {
                let last = segments.get(at + 1).is_none_or(|next| next.1 != *level);
                let names = if last { self.names(&[path, &vec![(INNER, 0); *level]].concat()) } else { String::new() };
                format!("{names}{word}{given}")
            })
            .collect();
        Some(format!("{package}{}", shown.join(".")))
    }

    fn kind(&mut self, path: &mut Vec<(u8, u8)>) -> Option<String> {
        let tag = *self.text.get(self.at)?;
        self.at += 1;
        let primitive = match tag {
            b'B' => "byte",
            b'C' => "char",
            b'D' => "double",
            b'F' => "float",
            b'I' => "int",
            b'J' => "long",
            b'S' => "short",
            b'Z' => "boolean",
            b'V' => "void",
            b'[' => {
                let mut dimensions = vec![self.names(path)];
                path.push((ARRAY, 0));
                while self.text.get(self.at) == Some(&b'[') {
                    self.at += 1;
                    dimensions.push(self.names(path));
                    path.push((ARRAY, 0));
                }
                let element = self.kind(path)?;
                path.truncate(path.len() - dimensions.len());
                let shown: String = dimensions.iter().map(|names| if names.is_empty() { "[]".to_string() } else { format!(" {names}[]") }).collect();
                return Some(format!("{element}{shown}"));
            }
            b'T' => {
                let end = self.at + self.text[self.at..].iter().position(|byte| *byte == b';')?;
                let name = String::from_utf8_lossy(&self.text[self.at..end]).into_owned();
                self.at = end + 1;
                return Some(format!("{}{name}", self.names(path)));
            }
            b'L' => return self.class(path),
            _ => return None,
        };
        Some(format!("{}{primitive}", self.names(path)))
    }
}

/// The parameter types of a method descriptor or signature with the type annotations on them, as javac prints
/// them. A variable arity parameter prints its array marks right before `...`, with no space.
pub fn shown_parameters(text: &[u8], varargs: bool, marks: &[Mark], inner: &Inner) -> Option<String> {
    let mut at = text.iter().position(|byte| *byte == b'(')? + 1;
    let mut all = Vec::new();
    while *text.get(at)? != b')' {
        let index = u8::try_from(all.len()).ok()?;
        let own = marks.iter().filter(|mark| mark.target == PARAMETER && mark.index == index).collect();
        let mut printer = Printer { text, at, marks: own, inner };
        let spread = varargs && text.get(at) == Some(&b'[') && ends_here(text, at);
        let shown = if spread {
            let names = printer.names(&[]);
            printer.at += 1;
            let element = printer.kind(&mut vec![(ARRAY, 0)])?;
            format!("{element}{}...", names.trim_end())
        } else {
            printer.kind(&mut Vec::new())?
        };
        at = printer.at;
        all.push(shown);
    }
    Some(all.join(","))
}

/// Whether the type starting at `at` is the last parameter.
fn ends_here(text: &[u8], at: usize) -> bool {
    let mut printer = Printer { text, at, marks: Vec::new(), inner: &Inner::new() };
    printer.kind(&mut Vec::new()).is_some() && text.get(printer.at) == Some(&b')')
}
