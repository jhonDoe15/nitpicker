//! A minimal class-file reader: name, supertypes, fields and method descriptors. Nothing else is read.
use super::model::{ClassInfo, Field, Method, OBJECT, Type, flag};

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
}

#[derive(Default)]
struct Attributes<'a> {
    signature: Option<&'a [u8]>,
    constant: Option<u16>,
    deprecated: bool,
    record: bool,
    permitted: Option<Vec<u16>>,
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

/// Skips one annotation and gives the index of its type descriptor.
fn skip_annotation(reader: &mut Reader) -> Option<u16> {
    let kind = reader.u2()?;
    for _ in 0..reader.u2()? {
        reader.skip(2)?;
        skip_element(reader)?;
    }
    Some(kind)
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
        } else if name == b"RuntimeVisibleAnnotations" {
            for _ in 0..reader.u2()? {
                let kind = skip_annotation(reader)?;
                found.deprecated |= utf8(kind) == Some(b"Ljava/lang/Deprecated;");
            }
        } else if name == b"PermittedSubclasses" {
            found.permitted = Some((0..reader.u2()?).map(|_| reader.u2()).collect::<Option<Vec<u16>>>()?);
        } else if name == b"Record" {
            found.record = true;
        }
        reader.at = end;
        if reader.at > reader.data.len() {
            return None;
        }
    }
    Some(found)
}

fn member_flags(access: u16, deprecated: bool) -> u16 {
    let mut bits = 0;
    for (mask, bit) in [(0x0010, flag::FINAL), (0x0001, flag::PUBLIC), (0x0004, flag::PROTECTED), (0x0008, flag::STATIC), (0x0400, flag::ABSTRACT)] {
        if access & mask != 0 {
            bits |= bit;
        }
    }
    if deprecated {
        bits |= flag::DEPRECATED;
    }
    bits
}

const ACC_ENUM: u16 = 0x4000;

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
            3 | 4 | 9 | 10 | 11 | 12 | 17 | 18 => {
                reader.skip(4)?;
                pool.push(Constant::Other);
            }
            5 | 6 => {
                reader.skip(8)?;
                pool.push(Constant::Other);
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
    let mut fields = Vec::new();
    let mut enum_constants = 0;
    for _ in 0..reader.u2()? {
        let flags = reader.u2()?;
        enum_constants += u32::from(flags & ACC_ENUM != 0);
        let field_name = utf8(reader.u2()?)?;
        let descriptor = utf8(reader.u2()?)?;
        let found = attributes(&mut reader, &utf8)?;
        let (signature, constant) = (found.signature, found.constant);
        if flags & (ACC_PRIVATE | ACC_SYNTHETIC) == 0 {
            let fixed = constant.filter(|_| flags & ACC_STATIC != 0).map(|_| Vec::new());
            let constant = constant.and_then(|index| match pool.get(index as usize)? {
                Constant::Text(text) => Some(String::from_utf8_lossy(utf8(*text)?).into_owned()),
                _ => None,
            });
            let kind = Signature { text: descriptor, at: 0 }.kind()?;
            let generic = signature.and_then(|text| Signature { text, at: 0 }.kind()).unwrap_or_else(|| kind.clone());
            fields.push(Field { name: String::from_utf8_lossy(field_name).into_owned(), kind, generic, constant, strict: fixed.is_some(), fixed, is_private: flags & 0x0002 != 0, flags: member_flags(flags, found.deprecated) });
        }
    }
    let mut methods = Vec::new();
    for _ in 0..reader.u2()? {
        let flags = reader.u2()?;
        let method_name = utf8(reader.u2()?)?;
        let descriptor = utf8(reader.u2()?)?;
        let found = attributes(&mut reader, &utf8)?;
        let signature = found.signature;
        if flags & (ACC_PRIVATE | ACC_SYNTHETIC) == 0 && method_name != b"<clinit>" {
            let (_, parameters, returns) = Signature { text: descriptor, at: 0 }.method()?;
            let generic = signature
                .and_then(|text| Signature { text, at: 0 }.method())
                .filter(|(_, generic, _)| generic.len() == parameters.len());
            let (type_parameters, generic_parameters, generic_returns) =
                generic.unwrap_or_else(|| (Vec::new(), parameters.clone(), returns.clone()));
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
                flags: member_flags(flags, found.deprecated),
            });
        }
    }
    let found = attributes(&mut reader, &utf8)?;
    let signature = found.signature;
    let mut class_flags = member_flags(access, found.deprecated);
    for (mask, bit) in [(0x4000, flag::ENUM), (0x2000, flag::ANNOTATION)] {
        if access & mask != 0 {
            class_flags |= bit;
        }
    }
    if found.record {
        class_flags |= flag::RECORD;
    }
    let permitted: Option<Vec<String>> = found.permitted.map(|listed| listed.into_iter().filter_map(&class_name).collect());
    if permitted.is_some() {
        class_flags |= flag::SEALED;
    }
    let mut type_parameters = Vec::new();
    let mut generic_supers = Vec::new();
    if let Some(text) = signature {
        let mut signature = Signature { text, at: 0 };
        type_parameters = signature.type_parameters().unwrap_or_default();
        while let Some(kind) = signature.kind() {
            generic_supers.push(kind);
        }
    } else {
        generic_supers.extend(superclass.iter().chain(&interfaces).map(|name| Type::class(name)));
    }
    Some(ClassInfo {
        name,
        package: package_name,
        superclass,
        interfaces,
        generic_supers,
        type_parameters,
        fields,
        methods,
        is_interface: access & ACC_INTERFACE != 0,
        enum_constants: (access & ACC_ENUM != 0).then_some(enum_constants),
        flags: class_flags,
        permitted,
    })
}
