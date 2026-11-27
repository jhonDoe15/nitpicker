//! A minimal class-file reader: name, supertypes, fields and method descriptors. Nothing else is read.
use super::model::{ClassInfo, Detail, Field, Hidden, Method, OBJECT, Type, flag};
use super::typemarks::{self, Mark};

struct Reader<'a> {
    data: &'a [u8],
    at: usize,
}

impl<'a> Reader<'a> {
    fn u1(&mut self) -> Option<u8> {
        let value = *self.data.get(self.at)?;
        self.at += 1;
        Some(value)
    }
    fn u2(&mut self) -> Option<u16> {
        let bytes = self.data.get(self.at..self.at + 2)?;
        self.at += 2;
        Some(u16::from_be_bytes([bytes[0], bytes[1]]))
    }
    fn u4(&mut self) -> Option<u32> {
        let bytes = self.data.get(self.at..self.at + 4)?;
        self.at += 4;
        Some(u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }
    fn skip(&mut self, count: usize) -> Option<()> {
        self.at = self.at.checked_add(count)?;
        (self.at <= self.data.len()).then_some(())
    }
}

enum Constant<'a> {
    Utf8(&'a [u8]),
    Class(u16),
    Text(u16),
    Int(i32),
    Wide(i64),
    Other,
}

const ACC_STATIC: u16 = 0x0008;
const ACC_PRIVATE: u16 = 0x0002;
const ACC_INTERFACE: u16 = 0x0200;
const ACC_ABSTRACT: u16 = 0x0400;
const ACC_VARARGS: u16 = 0x0080;
const ACC_SYNTHETIC: u16 = 0x1000;

pub fn dotted(internal: &str) -> String {
    internal.replace(['/', '$'], ".")
}

/// Reads descriptors and generic signatures; both use the same grammar for the parts read here.
struct Signature<'a> {
    text: &'a [u8],
    at: usize,
    /// The first bound of each type parameter read last, type arguments kept.
    written_bounds: Vec<Type>,
}

impl<'a> Signature<'a> {
    fn peek(&self) -> Option<u8> {
        self.text.get(self.at).copied()
    }
    fn word(&mut self, stops: &[u8]) -> Option<&'a str> {
        let length = self.text[self.at..].iter().position(|byte| stops.contains(byte))?;
        let word = std::str::from_utf8(&self.text[self.at..self.at + length]).ok()?;
        self.at += length;
        Some(word)
    }
    fn arguments(&mut self) -> Option<Vec<Type>> {
        let mut arguments = Vec::new();
        if self.peek() != Some(b'<') {
            return Some(arguments);
        }
        self.at += 1;
        while self.peek()? != b'>' {
            match self.peek()? {
                b'*' => {
                    self.at += 1;
                    arguments.push(Type::Wildcard);
                }
                b'+' | b'-' => {
                    self.at += 1;
                    arguments.push(self.kind()?);
                }
                _ => arguments.push(self.kind()?),
            }
        }
        self.at += 1;
        Some(arguments)
    }
    fn kind(&mut self) -> Option<Type> {
        let tag = self.peek()?;
        self.at += 1;
        Some(match tag {
            b'B' => Type::Primitive("byte"),
            b'C' => Type::Primitive("char"),
            b'D' => Type::Primitive("double"),
            b'F' => Type::Primitive("float"),
            b'I' => Type::Primitive("int"),
            b'J' => Type::Primitive("long"),
            b'S' => Type::Primitive("short"),
            b'Z' => Type::Primitive("boolean"),
            b'V' => Type::Primitive("void"),
            b'[' => Type::Array(Box::new(self.kind()?)),
            b'T' => {
                let name = self.word(b";")?.to_string();
                self.at += 1;
                Type::Variable(name)
            }
            b'L' => {
                let mut name = dotted(self.word(b"<;.")?);
                let mut arguments = self.arguments()?;
                while self.peek()? == b'.' {
                    self.at += 1;
                    name = format!("{name}.{}", dotted(self.word(b"<;.")?));
                    arguments = self.arguments()?;
                }
                self.at += 1;
                Type::Class(name, arguments)
            }
            _ => return None,
        })
    }
    fn type_parameters(&mut self) -> Option<Vec<(String, Type)>> {
        let mut parameters = Vec::new();
        self.written_bounds.clear();
        if self.peek() != Some(b'<') {
            return Some(parameters);
        }
        self.at += 1;
        while self.peek()? != b'>' {
            let name = self.word(b":")?.to_string();
            let mut bounds = Vec::new();
            while self.peek()? == b':' {
                self.at += 1;
                if self.peek()? != b':' {
                    bounds.push(self.kind()?);
                }
            }
            if bounds.len() > 1 {
                bounds.retain(|kind| *kind != Type::class(OBJECT));
            }
            self.written_bounds.push(bounds.first().cloned().unwrap_or(Type::class(OBJECT)));
            let several = bounds.len() > 1 && bounds.iter().all(|kind| matches!(kind, Type::Class(..)));
            let joined = several.then(|| Type::class(&bounds.iter().map(Type::name).collect::<Vec<_>>().join("&")));
            let bound = match joined.or_else(|| bounds.into_iter().next()) {
                Some(kind @ Type::Class(..)) if several => Some(kind),
                Some(Type::Variable(other)) => {
                    parameters.iter().find(|(known, _)| *known == other).map(|(_, kind): &(String, Type)| kind.clone())
                }
                Some(kind) => Some(kind.erased()),
                None => None,
            };
            parameters.push((name, bound.unwrap_or(Type::class(OBJECT))));
        }
        self.at += 1;
        Some(parameters)
    }
    fn method(&mut self) -> Option<(Vec<(String, Type)>, Vec<Type>, Type)> {
        let type_parameters = self.type_parameters()?;
        if self.peek()? != b'(' {
            return None;
        }
        self.at += 1;
        let mut parameters = Vec::new();
        while self.peek()? != b')' {
            parameters.push(self.kind()?);
        }
        self.at += 1;
        Some((type_parameters, parameters, self.kind()?))
    }
    /// The `throws` part, after `method` has read the rest.
    fn throws(&mut self) -> Vec<Type> {
        let mut listed = Vec::new();
        while self.peek() == Some(b'^') {
            self.at += 1;
            match self.kind() {
                Some(kind) => listed.push(kind),
                None => break,
            }
        }
        listed
    }
}

#[derive(Default)]
struct Attributes<'a> {
    check_for_null: bool,
    nickname: Option<&'a [u8]>,
    signature: Option<&'a [u8]>,
    constant: Option<u16>,
    deprecated: bool,
    nullable: bool,
    record: bool,
    permitted: Option<Vec<u16>>,
    /// For a record: the generic type of each component, in order.
    components: Option<Vec<Type>>,
    inner: Vec<(u16, u16)>,
    exceptions: Vec<u16>,
    names: Vec<u16>,
    /// From the code of a method: the name of each local variable that lives from the first instruction, by slot.
    locals: Vec<(u16, u16)>,
    marks: u32,
    /// Constant pool entries of the strings in `containerOf` of `@Immutable`.
    held: Vec<u16>,
    /// Constant names listed by `@IncompatibleModifiers`.
    incompatible: Vec<&'a [u8]>,
    /// Constant names listed by `@RequiredModifiers`: those of `value`, then those of `modifier`.
    required: [Vec<&'a [u8]>; 2],
    /// Positions of the type parameters with `@ImmutableTypeParameter`.
    strict: Vec<u8>,
    annotations: Vec<&'a [u8]>,
    /// Constant pool entries of the strings in the `value` of the `@GuardedBy` annotations.
    guards: Vec<u16>,
    /// Constant pool index of the value of `optional` on `@Inject`.
    optional: Option<u16>,
    parameter_annotations: Vec<Vec<&'a [u8]>>,
    targets: Option<u16>,
    annotated_parameters: usize,
    nullable_parameters: u64,
    contract: Option<u16>,
    starts: bool,
    /// `@DoNotMock` on the class: the constant pool index of its value, when it has one.
    do_not_mock: Option<Option<u16>>,
    type_marks: Vec<Mark>,
    /// `@org.mockito.Mock` without an explicit `answer`.
    mock: bool,
}

fn starter(descriptor: &[u8]) -> bool {
    let named = descriptor.strip_prefix(b"L").and_then(|rest| rest.strip_suffix(b";"));
    named.is_some_and(|named| super::model::STARTERS.iter().any(|known| known.len() == named.len() && known.bytes().zip(named).all(|(a, b)| a == *b || a == b'.' && *b == b'/')))
}

fn skip_element(reader: &mut Reader) -> Option<()> {
    match reader.u1()? {
        b'e' => reader.skip(4),
        b'@' => skip_annotation(reader).map(|_| ()),
        b'[' => {
            for _ in 0..reader.u2()? {
                skip_element(reader)?;
            }
            Some(())
        }
        _ => reader.skip(2),
    }
}

/// Reads one element value and adds the constant names of the enum values in it.
fn enum_names<'a>(reader: &mut Reader, utf8: &impl Fn(u16) -> Option<&'a [u8]>, out: &mut Vec<&'a [u8]>) -> Option<()> {
    match reader.u1()? {
        b'e' => {
            reader.skip(2)?;
            out.extend(utf8(reader.u2()?));
            Some(())
        }
        b'[' => {
            for _ in 0..reader.u2()? {
                enum_names(reader, utf8, out)?;
            }
            Some(())
        }
        b'@' => skip_annotation(reader).map(|_| ()),
        _ => reader.skip(2),
    }
}

/// Reads one annotation: its type descriptor, and for `@Target` the element types it lists.
fn annotation<'a>(reader: &mut Reader, utf8: &impl Fn(u16) -> Option<&'a [u8]>, targets: &mut Option<u16>, retention: &mut u32) -> Option<&'a [u8]> {
    let kind = utf8(reader.u2()?)?;
    let target = kind == b"Ljava/lang/annotation/Target;";
    let retained = kind == b"Ljava/lang/annotation/Retention;";
    for _ in 0..reader.u2()? {
        reader.skip(2)?;
        if retained {
            let mut names = Vec::new();
            enum_names(reader, utf8, &mut names)?;
            *retention |= names.iter().filter_map(|name| std::str::from_utf8(name).ok()).fold(0, |bits, name| bits | flag::of_retention(name));
        } else if target {
            let mut names = Vec::new();
            enum_names(reader, utf8, &mut names)?;
            let bits = names.iter().filter_map(|name| std::str::from_utf8(name).ok()).fold(0, |bits, name| bits | super::model::target::bit(name));
            *targets = Some(targets.unwrap_or(0) | bits);
        } else {
            skip_element(reader)?;
        }
    }
    if target && targets.is_none() {
        *targets = Some(0);
    }
    Some(kind)
}

fn annotation_name(descriptor: &[u8]) -> Option<String> {
    let text = std::str::from_utf8(descriptor).ok()?.strip_prefix('L')?.strip_suffix(';')?;
    Some(text.replace(['/', '$'], "."))
}

/// Skips one annotation and gives the index of its type descriptor.
fn skip_annotation(reader: &mut Reader) -> Option<u16> {
    let kind = reader.u2()?;
    for _ in 0..reader.u2()? {
        reader.skip(2)?;
        skip_element(reader)?;
    }
    Some(kind)
}

/// Reads one annotation: the index of its type descriptor and, when its first element is a string, that string's index.
fn read_annotation(reader: &mut Reader) -> Option<(u16, Option<u16>)> {
    let kind = reader.u2()?;
    let mut text = None;
    for position in 0..reader.u2()? {
        reader.skip(2)?;
        let before = reader.at;
        if reader.u1()? == b's' && position == 0 {
            text = Some(reader.u2()?);
        } else {
            reader.at = before;
            skip_element(reader)?;
        }
    }
    Some((kind, text))
}

/// The constant pool entries of the strings an element holds, alone or in an array.
fn element_strings(reader: &mut Reader, into: &mut Vec<u16>) -> Option<()> {
    let start = reader.at;
    match reader.u1()? {
        b's' => into.push(reader.u2()?),
        b'[' => {
            for _ in 0..reader.u2()? {
                element_strings(reader, into)?;
            }
        }
        _ => {
            reader.at = start;
            skip_element(reader)?;
        }
    }
    Some(())
}

/// One entry of a type annotations attribute. Gives nothing for a target that only code attributes hold.
fn type_annotation<'a>(reader: &mut Reader, utf8: &impl Fn(u16) -> Option<&'a [u8]>) -> Option<Mark> {
    let target = reader.u1()?;
    let index = match target {
        0x00 | 0x01 | 0x16 => reader.u1()?,
        0x10 | 0x17 => reader.skip(2).map(|_| 0)?,
        0x11 | 0x12 => reader.skip(2).map(|_| 0)?,
        0x13..=0x15 => 0,
        _ => return None,
    };
    let steps = reader.u1()?;
    let path = (0..steps).map(|_| Some((reader.u1()?, reader.u1()?))).collect::<Option<Vec<_>>>()?;
    let name = annotation_name(utf8(skip_annotation(reader)?)?)?;
    Some(Mark { target, index, path, name })
}

/// The parameter names javac reads from the local variable table of a method's code: one per parameter, `arg<n>`
/// for a parameter the table does not name; empty without a table.
fn local_names<'a>(locals: &[(u16, u16)], descriptor: &[u8], is_static: bool, utf8: &impl Fn(u16) -> Option<&'a [u8]>) -> Vec<String> {
    if locals.is_empty() {
        return Vec::new();
    }
    let mut names = Vec::new();
    let mut slot = u16::from(!is_static);
    let mut at = 1;
    while at < descriptor.len() && descriptor[at] != b')' {
        let mut array = false;
        while descriptor[at] == b'[' {
            array = true;
            at += 1;
        }
        let wide = !array && matches!(descriptor[at], b'J' | b'D');
        if descriptor[at] == b'L' {
            while at < descriptor.len() && descriptor[at] != b';' {
                at += 1;
            }
        }
        at += 1;
        let found = locals.iter().find(|(register, _)| *register == slot).and_then(|(_, name)| utf8(*name));
        names.push(found.map_or_else(|| format!("arg{}", names.len()), |name| String::from_utf8_lossy(name).into_owned()));
        slot += if wide { 2 } else { 1 };
    }
    names
}

fn attributes<'a>(reader: &mut Reader<'a>, utf8: &impl Fn(u16) -> Option<&'a [u8]>) -> Option<Attributes<'a>> {
    let mut found = Attributes::default();
    for _ in 0..reader.u2()? {
        let name = utf8(reader.u2()?)?;
        let length = reader.u4()? as usize;
        let end = reader.at + length;
        if name == b"Signature" && length == 2 {
            found.signature = utf8(reader.u2()?);
        } else if name == b"ConstantValue" && length == 2 {
            found.constant = Some(reader.u2()?);
        } else if name == b"RuntimeVisibleAnnotations" || name == b"RuntimeInvisibleAnnotations" {
            for _ in 0..reader.u2()? {
                let begin = reader.at;
                let (_, text) = read_annotation(reader)?;
                reader.at = begin;
                let kind = annotation(reader, utf8, &mut found.targets, &mut found.marks)?;
                if kind == b"Lcom/google/errorprone/annotations/Immutable;" {
                    reader.at = begin + 2;
                    for _ in 0..reader.u2()? {
                        if utf8(reader.u2()?) == Some(b"containerOf") {
                            element_strings(reader, &mut found.held)?;
                        } else {
                            skip_element(reader)?;
                        }
                    }
                }
                if kind == b"Lcom/google/errorprone/annotations/IncompatibleModifiers;" {
                    reader.at = begin + 2;
                    for _ in 0..reader.u2()? {
                        reader.skip(2)?;
                        enum_names(reader, utf8, &mut found.incompatible)?;
                    }
                }
                if kind == b"Lcom/google/errorprone/annotations/RequiredModifiers;" {
                    reader.at = begin + 2;
                    for _ in 0..reader.u2()? {
                        match utf8(reader.u2()?) {
                            Some(b"value") => enum_names(reader, utf8, &mut found.required[0])?,
                            Some(b"modifier") => enum_names(reader, utf8, &mut found.required[1])?,
                            _ => skip_element(reader)?,
                        }
                    }
                }
                if annotation_name(kind).is_some_and(|name| super::guards::GUARDED_BY.contains(&name.as_str())) {
                    reader.at = begin + 2;
                    for _ in 0..reader.u2()? {
                        if utf8(reader.u2()?) == Some(b"value") {
                            element_strings(reader, &mut found.guards)?;
                        } else {
                            skip_element(reader)?;
                        }
                    }
                }
                if kind == b"Lcom/google/inject/Inject;" {
                    reader.at = begin + 2;
                    for _ in 0..reader.u2()? {
                        let key = utf8(reader.u2()?);
                        if key == Some(b"optional") && reader.data.get(reader.at) == Some(&b'Z') {
                            reader.skip(1)?;
                            found.optional = Some(reader.u2()?);
                        } else {
                            skip_element(reader)?;
                        }
                    }
                }
                if kind == b"Lorg/mockito/Mock;" {
                    reader.at = begin + 2;
                    let mut answered = false;
                    for _ in 0..reader.u2()? {
                        answered |= utf8(reader.u2()?) == Some(b"answer");
                        skip_element(reader)?;
                    }
                    found.mock = !answered;
                }
                if kind == b"Lcom/google/errorprone/annotations/DoNotMock;" {
                    found.do_not_mock = Some(text);
                }
                found.deprecated |= kind == b"Ljava/lang/Deprecated;";
                found.marks |= annotation_name(kind).map_or(0, |name| flag::of_annotation(&name));
                if kind.ends_with(b"/Contract;") {
                    let after = reader.at;
                    reader.at = begin + 2;
                    for _ in 0..reader.u2()? {
                        let element = utf8(reader.u2()?);
                        let start = reader.at;
                        if element == Some(b"value") && reader.u1()? == b's' {
                            found.contract = Some(reader.u2()?);
                        } else {
                            reader.at = start;
                            skip_element(reader)?;
                        }
                    }
                    reader.at = after;
                }
                found.starts |= kind.ends_with(b"/Initializer;") || starter(kind);
                found.nullable |= kind.ends_with(b"/Nullable;") || kind.ends_with(b"/CheckForNull;") || kind.ends_with(b"/ParametricNullness;");
                found.check_for_null |= matches!(kind, b"Ljavax/annotation/CheckForNull;" | b"Ledu/umd/cs/findbugs/annotations/CheckForNull;");
                if kind.windows(4).any(|part| part == b"Null") && kind != b"Ljavax/annotation/Nullable;" {
                    found.nickname = Some(kind);
                }
                found.annotations.push(kind);
            }
        } else if name == b"RuntimeVisibleParameterAnnotations" || name == b"RuntimeInvisibleParameterAnnotations" {
            let count = reader.u1()? as usize;
            found.annotated_parameters = found.annotated_parameters.max(count);
            if found.parameter_annotations.len() < count {
                found.parameter_annotations.resize(count, Vec::new());
            }
            for at in 0..count {
                for _ in 0..reader.u2()? {
                    let kind = utf8(skip_annotation(reader)?)?;
                    if (kind.ends_with(b"/Nullable;") || kind.ends_with(b"/CheckForNull;") || kind.ends_with(b"/ParametricNullness;")) && at < 64 {
                        found.nullable_parameters |= 1 << at;
                    }
                    found.parameter_annotations[at].push(kind);
                }
            }
        } else if name == b"RuntimeVisibleTypeAnnotations" || name == b"RuntimeInvisibleTypeAnnotations" {
            for _ in 0..reader.u2()? {
                let Some(mark) = type_annotation(reader, utf8) else { break };
                if mark.target == 0x00 && mark.name == flag::IMMUTABLE_PARAMETER_NAME && name == b"RuntimeVisibleTypeAnnotations" {
                    found.strict.push(mark.index);
                }
                found.type_marks.push(mark);
            }
        } else if name == b"PermittedSubclasses" {
            found.permitted = Some((0..reader.u2()?).map(|_| reader.u2()).collect::<Option<Vec<u16>>>()?);
        } else if name == b"InnerClasses" {
            for _ in 0..reader.u2()? {
                let class = reader.u2()?;
                reader.skip(4)?;
                found.inner.push((class, reader.u2()?));
            }
        } else if name == b"MethodParameters" {
            for _ in 0..reader.u1()? {
                found.names.push(reader.u2()?);
                reader.skip(2)?;
            }
        } else if name == b"Code" {
            reader.skip(4)?;
            let code = reader.u4()? as usize;
            reader.skip(code)?;
            let handlers = reader.u2()? as usize;
            reader.skip(handlers * 8)?;
            for _ in 0..reader.u2()? {
                let inner = utf8(reader.u2()?).unwrap_or_default();
                let size = reader.u4()? as usize;
                let finish = reader.at + size;
                if inner == b"LocalVariableTable" {
                    for _ in 0..reader.u2()? {
                        let start = reader.u2()?;
                        reader.skip(2)?;
                        let name = reader.u2()?;
                        reader.skip(2)?;
                        let slot = reader.u2()?;
                        if start == 0 {
                            found.locals.push((slot, name));
                        }
                    }
                }
                reader.at = finish;
            }
        } else if name == b"Exceptions" {
            found.exceptions = (0..reader.u2()?).map(|_| reader.u2()).collect::<Option<Vec<u16>>>()?;
        } else if name == b"Record" {
            found.record = true;
            let mut listed = Vec::new();
            for _ in 0..reader.u2()? {
                reader.skip(2)?;
                let descriptor = utf8(reader.u2()?)?;
                let text = attributes(reader, utf8)?.signature.unwrap_or(descriptor);
                listed.push(Signature { text, at: 0, written_bounds: Vec::new() }.kind()?);
            }
            found.components = Some(listed);
        }
        reader.at = end;
        if reader.at > reader.data.len() {
            return None;
        }
    }
    Some(found)
}

/// One type of a descriptor or generic signature, printed the way javac prints a type.
fn show_type(text: &[u8], at: &mut usize) -> Option<String> {
    let tag = *text.get(*at)?;
    *at += 1;
    let named = |name: &str| Some(name.to_string());
    match tag {
        b'B' => named("byte"),
        b'C' => named("char"),
        b'D' => named("double"),
        b'F' => named("float"),
        b'I' => named("int"),
        b'J' => named("long"),
        b'S' => named("short"),
        b'Z' => named("boolean"),
        b'V' => named("void"),
        b'[' => Some(format!("{}[]", show_type(text, at)?)),
        b'T' => {
            let end = *at + text[*at..].iter().position(|byte| *byte == b';')?;
            let name = String::from_utf8_lossy(&text[*at..end]).into_owned();
            *at = end + 1;
            Some(name)
        }
        b'L' => {
            let mut out = String::new();
            loop {
                match *text.get(*at)? {
                    b';' => {
                        *at += 1;
                        return Some(out);
                    }
                    b'<' => {
                        *at += 1;
                        let mut given = Vec::new();
                        while *text.get(*at)? != b'>' {
                            given.push(match text[*at] {
                                b'*' => {
                                    *at += 1;
                                    "?".to_string()
                                }
                                b'+' => {
                                    *at += 1;
                                    format!("? extends {}", show_type(text, at)?)
                                }
                                b'-' => {
                                    *at += 1;
                                    format!("? super {}", show_type(text, at)?)
                                }
                                _ => show_type(text, at)?,
                            });
                        }
                        *at += 1;
                        out.push_str(&format!("<{}>", given.join(",")));
                    }
                    b'/' | b'$' | b'.' => {
                        *at += 1;
                        out.push('.');
                    }
                    other => {
                        *at += 1;
                        out.push(other as char);
                    }
                }
            }
        }
        _ => None,
    }
}

/// The parameter types of a method descriptor or signature, as javac prints them.
fn show_parameters(text: &[u8], varargs: bool) -> Option<String> {
    let mut at = text.iter().position(|byte| *byte == b'(')? + 1;
    let mut all = Vec::new();
    while *text.get(at)? != b')' {
        all.push(show_type(text, &mut at)?);
    }
    if let Some(last) = all.last_mut().filter(|last| varargs && last.ends_with("[]")) {
        last.truncate(last.len() - 2);
        last.push_str("...");
    }
    Some(all.join(","))
}

/// The distinct strings at those constant pool entries.
fn guard_strings<'a>(entries: &[u16], utf8: &impl Fn(u16) -> Option<&'a [u8]>) -> Vec<super::guards::Expr> {
    let mut found: Vec<super::guards::Expr> = Vec::new();
    for text in entries.iter().filter_map(|entry| utf8(*entry)).map(|text| String::from_utf8_lossy(text).into_owned()) {
        let text = super::guards::Expr::Str(text);
        if !found.contains(&text) {
            found.push(text);
        }
    }
    found
}

fn member_flags(access: u16, found: &Attributes) -> u32 {
    let deprecated = found.deprecated;
    let mut bits = found.marks;
    for (mask, bit) in [(0x0010, flag::FINAL), (0x0001, flag::PUBLIC), (0x0004, flag::PROTECTED), (0x0008, flag::STATIC), (0x0400, flag::ABSTRACT)] {
        if access & mask != 0 {
            bits |= bit;
        }
    }
    if deprecated {
        bits |= flag::DEPRECATED;
    }
    if found.nullable {
        bits |= flag::NULLABLE;
    }
    if found.check_for_null {
        bits |= flag::CHECK_FOR_NULL;
    }
    if found.nickname.is_some() {
        bits |= flag::MAYBE_CHECK_FOR_NULL;
    }
    bits
}

const ACC_ENUM: u16 = 0x4000;

/// Takes the nullness NullAway reads from a method's type annotations, and prints its parameters with them.
/// A variable arity parameter is marked for its elements, and the array itself gets its own flag.
fn mark_method(method: &mut Method, marks: &[Mark], (descriptor, written): (&[u8], &[u8]), inner: &typemarks::Inner, shift: usize) {
    if marks.is_empty() {
        return;
    }
    let (parameters, result) = typemarks::descriptor_parts(descriptor);
    let shift = if method.name == "<init>" { shift } else { 0 };
    for mark in marks.iter().filter(|mark| typemarks::nullable(&mark.name)) {
        let at = usize::from(mark.index) + shift;
        match mark.target {
            typemarks::RESULT if typemarks::direct(mark, result, inner) => method.flags |= flag::NULLABLE,
            typemarks::PARAMETER if at < 64 && at < parameters.len() => {
                let spread = method.varargs && at + 1 == parameters.len();
                if spread && typemarks::direct(mark, parameters[at], inner) {
                    method.flags |= flag::NULLABLE_VARARGS;
                } else if (spread && typemarks::elements(mark)) || (!spread && typemarks::direct(mark, parameters[at], inner)) {
                    method.nullable_parameters |= 1 << at;
                }
            }
            _ => {}
        }
    }
    method.detail.nullable_types = marks.iter().filter(|mark| typemarks::shown_nullable(mark)).map(|mark| (mark.index, mark.path.clone())).collect();
    if method.name != "<init>" && marks.iter().any(|mark| mark.target == typemarks::PARAMETER) {
        method.detail.marked = typemarks::shown_parameters(written, method.varargs, marks, inner).unwrap_or_default();
    }
}

/// A constructor of an inner class takes the enclosing instance first, which the source never writes; its generic
/// signature, declaration annotations and type annotations already leave it out.
fn drop_enclosing_instance(method: &mut Method, signature: Option<&[u8]>) {
    let count = method.parameters.len();
    method.parameters.remove(0);
    let generic = signature.and_then(|text| Signature { text, at: 0, written_bounds: Vec::new() }.method()).filter(|(_, listed, _)| listed.len() + 1 == count);
    match generic {
        Some((type_parameters, listed, _)) => {
            method.generic_parameters = listed;
            method.type_bounds = type_parameters.iter().map(|(_, bound)| bound.clone()).collect();
            method.type_parameters = type_parameters.into_iter().map(|(name, _)| name).collect();
            method.shown = signature.and_then(|text| show_parameters(text, method.varargs)).unwrap_or_default();
        }
        None => {
            method.generic_parameters.remove(0);
            method.shown = method.shown.split_once(',').map_or_else(String::new, |(_, rest)| rest.to_string());
        }
    }
    if method.names.len() == count {
        method.names.remove(0);
    }
    if method.detail.parameter_annotations.len() == count {
        method.detail.parameter_annotations.remove(0);
    }
    method.nullable_parameters >>= 1;
}

pub fn parse(data: &[u8]) -> Option<ClassInfo> {
    let mut reader = Reader { data, at: 0 };
    if reader.u4()? != 0xCAFE_BABE {
        return None;
    }
    reader.skip(4)?;
    let count = reader.u2()? as usize;
    let mut pool: Vec<Constant> = Vec::with_capacity(count);
    pool.push(Constant::Other);
    while pool.len() < count {
        match reader.u1()? {
            1 => {
                let length = reader.u2()? as usize;
                pool.push(Constant::Utf8(data.get(reader.at..reader.at + length)?));
                reader.skip(length)?;
            }
            7 => pool.push(Constant::Class(reader.u2()?)),
            8 => pool.push(Constant::Text(reader.u2()?)),
            16 | 19 | 20 => {
                reader.skip(2)?;
                pool.push(Constant::Other);
            }
            15 => {
                reader.skip(3)?;
                pool.push(Constant::Other);
            }
            3 => pool.push(Constant::Int(reader.u4()? as i32)),
            4 => pool.push(Constant::Wide(i64::from(reader.u4()?))),
            9 | 10 | 11 | 12 | 17 | 18 => {
                reader.skip(4)?;
                pool.push(Constant::Other);
            }
            5 | 6 => {
                let high = u64::from(reader.u4()?);
                pool.push(Constant::Wide(((high << 32) | u64::from(reader.u4()?)) as i64));
                pool.push(Constant::Other);
            }
            _ => return None,
        }
    }
    let utf8 = |index: u16| match pool.get(index as usize)? {
        Constant::Utf8(bytes) => Some(*bytes),
        _ => None,
    };
    let class_name = |index: u16| match pool.get(index as usize)? {
        Constant::Class(name) => std::str::from_utf8(utf8(*name)?).ok().map(dotted),
        _ => None,
    };
    let access = reader.u2()?;
    let own = reader.u2()?;
    let internal = match pool.get(own as usize)? {
        Constant::Class(index) => std::str::from_utf8(utf8(*index)?).ok()?,
        _ => return None,
    };
    let package_name = internal.rsplit_once('/').map(|(package, _)| package.replace('/', ".")).unwrap_or_default();
    let name = dotted(internal);
    let superclass = class_name(reader.u2()?);
    let interfaces = (0..reader.u2()?).map(|_| reader.u2().and_then(&class_name)).collect::<Option<Vec<_>>>()?;
    let mut null_nicknames: Vec<String> = Vec::new();
    let mut nickname = |found: &Attributes| {
        let name = found.nickname.and_then(|text| std::str::from_utf8(text).ok()).map(|text| dotted(text.trim_start_matches('L').trim_end_matches(';')));
        null_nicknames.extend(name.filter(|name| !null_nicknames.contains(name)));
    };
    let mut hidden: Vec<Hidden> = Vec::new();
    let mut fields = Vec::new();
    let mut field_marks = Vec::new();
    let mut method_marks = Vec::new();
    let mut enum_constants = 0;
    for _ in 0..reader.u2()? {
        let flags = reader.u2()?;
        enum_constants += u32::from(flags & ACC_ENUM != 0);
        let field_name = utf8(reader.u2()?)?;
        let descriptor = utf8(reader.u2()?)?;
        let mut found = attributes(&mut reader, &utf8)?;
        nickname(&found);
        let (signature, constant) = (found.signature, found.constant);
        let marks = std::mem::take(&mut found.type_marks);
        let found_number = constant;
        if flags & (ACC_PRIVATE | ACC_SYNTHETIC) == 0 {
            let fixed = constant.filter(|_| flags & ACC_STATIC != 0).map(|_| Vec::new());
            let constant = constant.and_then(|index| match pool.get(index as usize)? {
                Constant::Text(text) => Some(String::from_utf8_lossy(utf8(*text)?).into_owned()),
                Constant::Int(value) if descriptor == b"Z" => Some((*value != 0).to_string()),
                _ => None,
            });
            let number = found_number.and_then(|index| match pool.get(index as usize)? {
                Constant::Int(value) => Some(i64::from(*value)),
                Constant::Wide(value) => Some(*value),
                _ => None,
            });
            let kind = Signature { text: descriptor, at: 0, written_bounds: Vec::new() }.kind()?;
            let generic = signature.and_then(|text| Signature { text, at: 0, written_bounds: Vec::new() }.kind()).unwrap_or_else(|| kind.clone());
            field_marks.push((fields.len(), marks, descriptor));
            let mut annotations: Vec<String> = found.annotations.iter().filter_map(|kind| annotation_name(kind)).collect();
            if found.optional.is_some_and(|index| matches!(pool.get(index as usize), Some(Constant::Int(value)) if *value != 0)) {
                annotations.push("com.google.inject.Inject#optional".to_string());
            }
            fields.push(Field { name: String::from_utf8_lossy(field_name).into_owned(), kind, generic, constant, number, strict: fixed.is_some(), fixed, is_private: flags & 0x0002 != 0, mock: found.mock, annotations, guards: guard_strings(&found.guards, &utf8), folded: None, flags: member_flags(flags, &found) | if flags & 0x0040 != 0 { flag::VOLATILE } else { 0 } | if flags & 0x4000 != 0 { flag::ENUM } else { 0 } });
        } else if flags & ACC_SYNTHETIC == 0 {
            hidden.push(Hidden { name: String::from_utf8_lossy(field_name).into_owned(), descriptor: String::from_utf8_lossy(descriptor).into_owned(), is_static: flags & ACC_STATIC != 0, is_method: false, before: 0 });
        }
    }
    let mut methods = Vec::new();
    let mut constructors = Vec::new();
    let mut setter_like = false;
    let returns_own = format!(")L{internal};");
    for _ in 0..reader.u2()? {
        let flags = reader.u2()?;
        let method_name = utf8(reader.u2()?)?;
        let descriptor = utf8(reader.u2()?)?;
        setter_like |= flags & ACC_STATIC == 0
            && std::str::from_utf8(method_name).is_ok_and(super::model::setter_name)
            && !descriptor.ends_with(returns_own.as_bytes());
        let mut found = attributes(&mut reader, &utf8)?;
        nickname(&found);
        let signature = found.signature;
        let marks = std::mem::take(&mut found.type_marks);
        if flags & (ACC_PRIVATE | ACC_SYNTHETIC) == ACC_PRIVATE && method_name.first() != Some(&b'<') {
            hidden.push(Hidden { name: String::from_utf8_lossy(method_name).into_owned(), descriptor: String::from_utf8_lossy(descriptor).into_owned(), is_static: flags & ACC_STATIC != 0, is_method: true, before: methods.len() });
        }
        if flags & (ACC_PRIVATE | ACC_SYNTHETIC) == 0 && method_name != b"<clinit>" {
            let (_, parameters, returns) = Signature { text: descriptor, at: 0, written_bounds: Vec::new() }.method()?;
            let mut throws: Vec<Type> = found.exceptions.iter().filter_map(|class| class_name(*class)).map(|name| Type::class(&name)).collect();
            let generic = signature
                .and_then(|text| {
                    let mut reader = Signature { text, at: 0, written_bounds: Vec::new() };
                    let read = reader.method()?;
                    let listed = reader.throws();
                    if listed.len() == throws.len() {
                        throws = listed;
                    }
                    Some(read)
                })
                .filter(|(_, generic, _)| generic.len() == parameters.len());
            let (type_parameters, generic_parameters, generic_returns) =
                generic.unwrap_or_else(|| (Vec::new(), parameters.clone(), returns.clone()));
            let parameters_count = parameters.len();
            let written = signature.filter(|text| Signature { text, at: 0, written_bounds: Vec::new() }.method().is_some_and(|(_, listed, _)| listed.len() == parameters_count));
            if method_name == b"<init>" {
                constructors.push((methods.len(), descriptor, signature));
            }
            method_marks.push((methods.len(), marks, descriptor, written.unwrap_or(descriptor)));
            methods.push(Method {
                name: String::from_utf8_lossy(method_name).into_owned(),
                parameters,
                returns,
                generic_parameters,
                generic_returns,
                type_bounds: type_parameters.iter().map(|(_, bound)| bound.clone()).collect(),
                type_parameters: type_parameters.into_iter().map(|(name, _)| name).collect(),
                package_private: flags & 0x0007 == 0,
                is_abstract: flags & ACC_ABSTRACT != 0,
                is_static: flags & ACC_STATIC != 0,
                is_private: false,
                varargs: flags & ACC_VARARGS != 0,
                flags: member_flags(flags, &found),
                throws,
                names: if found.names.is_empty() { local_names(&found.locals, descriptor, flags & ACC_STATIC != 0, &utf8) } else { found.names.iter().filter_map(|name| utf8(*name)).map(|name| String::from_utf8_lossy(name).into_owned()).collect() },
                detail: Detail {
                    access: flags & 0x0d3f,
                    annotations: found.annotations.iter().filter_map(|kind| annotation_name(kind)).collect(),
                    guards: guard_strings(&found.guards, &utf8),
                    parameter_annotations: found
                        .parameter_annotations
                        .iter()
                        .map(|listed| listed.iter().filter_map(|kind| annotation_name(kind)).collect())
                        .collect(),
                    marked: String::new(),
                    nullable_types: Vec::new(),
                },
                shown: show_parameters(written.unwrap_or(descriptor), flags & ACC_VARARGS != 0).unwrap_or_default(),
                nullable_parameters: {
                    let shift = parameters_count.saturating_sub(found.annotated_parameters.max(1)).min(63);
                    if found.annotated_parameters == 0 { 0 } else { found.nullable_parameters << shift }
                },
                contract: found.contract.and_then(&utf8).map(|text| String::from_utf8_lossy(text).into_owned()).unwrap_or_default(),
                starts: found.starts,
            });
        }
    }
    let found = attributes(&mut reader, &utf8)?;
    let signature = found.signature;
    let mut class_flags = member_flags(access, &found);
    let inner: typemarks::Inner = found.inner.iter().filter(|(_, access)| access & ACC_STATIC == 0).filter_map(|(class, _)| match pool.get(*class as usize)? {
        Constant::Class(index) => std::str::from_utf8(utf8(*index)?).ok().map(str::to_string),
        _ => None,
    }).collect();
    for (at, marks, descriptor) in field_marks {
        if marks.iter().any(|mark| mark.target == typemarks::FIELD && typemarks::nullable(&mark.name) && typemarks::direct(mark, descriptor, &inner)) {
            fields[at].flags |= flag::NULLABLE;
        }
    }
    let shift = if access & 0x4000 != 0 { 2 } else { usize::from(inner.contains(internal)) };
    for (at, marks, descriptor, written) in method_marks {
        mark_method(&mut methods[at], &marks, (descriptor, written), &inner, shift);
    }
    if access & ACC_ENUM == 0 && inner.contains(internal) && let Some((outer, _)) = internal.rsplit_once('$') {
        let first = format!("(L{outer};");
        for (at, descriptor, signature) in constructors {
            if descriptor.starts_with(first.as_bytes()) {
                drop_enclosing_instance(&mut methods[at], signature);
            }
        }
    }
    for (mask, bit) in [(0x4000, flag::ENUM), (0x2000, flag::ANNOTATION)] {
        if access & mask != 0 {
            class_flags |= bit;
        }
    }
    if found.record {
        class_flags |= flag::RECORD;
    }
    let own_inner = found.inner.iter().find(|(class, _)| class_name(*class).as_deref() == Some(name.as_str())).is_some_and(|(_, access)| access & ACC_STATIC == 0);
    let own_private = found.inner.iter().any(|(class, access)| access & ACC_PRIVATE != 0 && class_name(*class).as_deref() == Some(name.as_str()));
    if own_private {
        class_flags |= flag::PRIVATE;
    }
    if found.inner.iter().any(|(class, access)| access & 0x0004 != 0 && class_name(*class).as_deref() == Some(name.as_str())) {
        class_flags = (class_flags & !flag::PUBLIC) | flag::PROTECTED;
    }
    let permitted: Option<Vec<String>> = found.permitted.map(|listed| listed.into_iter().filter_map(&class_name).collect());
    if permitted.is_some() {
        class_flags |= flag::SEALED;
    }
    let components = found.components;
    let mut type_parameters = Vec::new();
    let mut written_bounds = Vec::new();
    let mut generic_supers = Vec::new();
    if let Some(text) = signature {
        let mut signature = Signature { text, at: 0, written_bounds: Vec::new() };
        type_parameters = signature.type_parameters().unwrap_or_default();
        written_bounds = std::mem::take(&mut signature.written_bounds);
        while let Some(kind) = signature.kind() {
            generic_supers.push(kind);
        }
    } else {
        generic_supers.extend(superclass.iter().chain(&interfaces).map(|name| Type::class(name)));
    }
    let immutable_parameters = found.strict.iter().filter_map(|at| type_parameters.get(*at as usize)).map(|(name, _)| name.clone()).collect();
    Some(ClassInfo {
        name,
        package: package_name,
        superclass,
        interfaces,
        generic_supers,
        type_parameters,
        written_bounds,
        fields,
        methods,
        is_interface: access & ACC_INTERFACE != 0,
        enum_constants: (access & ACC_ENUM != 0).then_some(enum_constants),
        flags: class_flags,
        permitted,
        record_components: components,
        container_of: found.held.iter().filter_map(|entry| utf8(*entry)).map(|text| String::from_utf8_lossy(text).into_owned()).collect(),
        immutable_parameters,
        targets: found.targets,
        setter_like,
        null_nicknames,
        incompatible: found.incompatible.iter().map(|name| String::from_utf8_lossy(name).into_owned()).collect(),
        required: found.required.iter().flatten().map(|name| String::from_utf8_lossy(name).into_owned()).collect(),
        class_annotations: found.annotations.iter().filter_map(|kind| annotation_name(kind)).collect(),
        outer_instance: Some(own_inner),
        hidden,
        do_not_mock: found.do_not_mock.map(|text| text.and_then(utf8).map_or_else(|| "Create a real instance instead".to_string(), |text| String::from_utf8_lossy(text).into_owned())),
    })
}

/// The erased type a field descriptor stands for.
pub fn descriptor_type(descriptor: &str) -> Option<Type> {
    Signature { text: descriptor.as_bytes(), at: 0, written_bounds: Vec::new() }.kind()
}

/// The parameter types and the return type a method descriptor stands for.
pub fn descriptor_method(descriptor: &str) -> Option<(Vec<Type>, Type)> {
    let (_, parameters, returns) = Signature { text: descriptor.as_bytes(), at: 0, written_bounds: Vec::new() }.method()?;
    Some((parameters, returns))
}
