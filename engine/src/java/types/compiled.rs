//! The members of the run's own classes as javac wrote them into the build's class files: access bits, the methods
//! Lombok wrote (`@lombok.Generated`), their first lines and the fields their code loads and stores. Read only for
//! runs over code compiled with Lombok, from the class directories the build gives (`Options::classes`).
use rayon::prelude::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub const ACC_PUBLIC: u16 = 0x0001;
pub const ACC_PRIVATE: u16 = 0x0002;
pub const ACC_PROTECTED: u16 = 0x0004;
pub const ACC_STATIC: u16 = 0x0008;
pub const ACC_FINAL: u16 = 0x0010;
pub const ACC_SYNCHRONIZED: u16 = 0x0020;
pub const ACC_NATIVE: u16 = 0x0100;

const GENERATED: &[u8] = b"Llombok/Generated;";

/// A load or store of a field in a method's code.
#[derive(Clone, Debug)]
pub struct Access {
    /// The class the instruction names, a binary name with dots: `p.Outer$Inner`.
    pub owner: String,
    pub name: String,
    pub store: bool,
    pub is_static: bool,
    pub line: usize,
}

/// A call in a method's code: the class the instruction names, the method's name and descriptor.
#[derive(Clone, Debug)]
pub struct Call {
    pub owner: String,
    pub name: String,
    pub descriptor: String,
}

#[derive(Clone, Debug)]
pub struct CompiledMethod {
    pub name: String,
    pub descriptor: String,
    pub access: u16,
    /// Lombok wrote it: it carries `@lombok.Generated`.
    pub generated: bool,
    /// The lowest line of its line table.
    pub line: Option<usize>,
    /// The line of its first instruction.
    pub entry_line: Option<usize>,
    pub accesses: Vec<Access>,
    pub calls: Vec<Call>,
    /// Its code loads local 0, which is `this` in an instance method.
    pub loads_this: bool,
}

#[derive(Clone, Debug)]
pub struct CompiledField {
    pub name: String,
    pub descriptor: String,
    pub access: u16,
    /// javac wrote a `ConstantValue` for it: a final field set to a compile-time constant.
    pub constant: bool,
    /// Lombok wrote it: it carries `@lombok.Generated`.
    pub generated: bool,
}

#[derive(Clone, Debug, Default)]
pub struct CompiledClass {
    pub access: u16,
    /// Lombok wrote the whole class (a builder): it carries `@lombok.Generated`.
    pub generated: bool,
    /// For a member class: the access bits its `InnerClasses` entry gives, `static` among them.
    pub nested: Option<u16>,
    /// The member classes it declares, by binary name with dots.
    pub members: Vec<String>,
    /// The class as the type index reads class files.
    pub info: Option<super::model::ClassInfo>,
    pub fields: Vec<CompiledField>,
    /// In class-file order.
    pub methods: Vec<CompiledMethod>,
}

impl CompiledClass {
    pub fn field(&self, name: &str) -> Option<&CompiledField> {
        self.fields.iter().find(|field| field.name == name)
    }
    /// The lowest line any method has code on: where SpotBugs places findings about the whole class.
    pub fn first_line(&self) -> Option<usize> {
        self.methods.iter().filter_map(|method| method.line).min()
    }
}

struct Reader<'a> {
    data: &'a [u8],
    at: usize,
}

impl Reader<'_> {
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

#[derive(Clone, Copy)]
enum Constant<'a> {
    Utf8(&'a [u8]),
    Class(u16),
    Member(u16, u16),
    Call(u16, u16),
    Pair(u16, u16),
    Other,
}

struct Pool<'a>(Vec<Constant<'a>>);

impl<'a> Pool<'a> {
    fn utf8(&self, index: u16) -> Option<&'a [u8]> {
        match self.0.get(index as usize)? {
            Constant::Utf8(bytes) => Some(bytes),
            _ => None,
        }
    }
    fn text(&self, index: u16) -> Option<String> {
        std::str::from_utf8(self.utf8(index)?).ok().map(str::to_string)
    }
    fn class(&self, index: u16) -> Option<String> {
        match self.0.get(index as usize)? {
            Constant::Class(name) => Some(self.text(*name)?.replace('/', ".")),
            _ => None,
        }
    }
    /// The class and name of a field reference.
    fn member(&self, index: u16) -> Option<(String, String)> {
        let Constant::Member(class, pair) = *self.0.get(index as usize)? else { return None };
        let Constant::Pair(name, _) = *self.0.get(pair as usize)? else { return None };
        Some((self.class(class)?, self.text(name)?))
    }
    /// A method reference of a class or an interface.
    fn call(&self, index: u16) -> Option<Call> {
        let Constant::Call(class, pair) = *self.0.get(index as usize)? else { return None };
        let Constant::Pair(name, descriptor) = *self.0.get(pair as usize)? else { return None };
        Some(Call { owner: self.class(class)?, name: self.text(name)?, descriptor: self.text(descriptor)? })
    }
}

fn pool<'a>(reader: &mut Reader<'a>) -> Option<Pool<'a>> {
    let count = reader.u2()? as usize;
    let mut found = Vec::with_capacity(count);
    found.push(Constant::Other);
    while found.len() < count {
        let entry = match reader.u1()? {
            1 => {
                let length = reader.u2()? as usize;
                let bytes = reader.data.get(reader.at..reader.at + length)?;
                reader.skip(length)?;
                Constant::Utf8(bytes)
            }
            7 => Constant::Class(reader.u2()?),
            9 => Constant::Member(reader.u2()?, reader.u2()?),
            10 | 11 => Constant::Call(reader.u2()?, reader.u2()?),
            12 => Constant::Pair(reader.u2()?, reader.u2()?),
            8 | 16 | 19 | 20 => {
                reader.skip(2)?;
                Constant::Other
            }
            15 => {
                reader.skip(3)?;
                Constant::Other
            }
            3 | 4 | 17 | 18 => {
                reader.skip(4)?;
                Constant::Other
            }
            5 | 6 => {
                reader.skip(8)?;
                found.push(Constant::Other);
                Constant::Other
            }
            _ => return None,
        };
        found.push(entry);
    }
    Some(Pool(found))
}

fn skip_element(reader: &mut Reader) -> Option<()> {
    match reader.u1()? {
        b'e' => reader.skip(4),
        b'@' => skip_annotation(reader).map(|_| ()),
        b'[' => (0..reader.u2()?).try_for_each(|_| skip_element(reader)),
        _ => reader.skip(2),
    }
}

/// Skips one annotation and gives its type index.
fn skip_annotation(reader: &mut Reader) -> Option<u16> {
    let kind = reader.u2()?;
    for _ in 0..reader.u2()? {
        reader.skip(2)?;
        skip_element(reader)?;
    }
    Some(kind)
}

/// Reads a `RuntimeInvisibleAnnotations` attribute: whether it holds `@lombok.Generated`.
fn marked(reader: &mut Reader, pool: &Pool) -> Option<bool> {
    let mut found = false;
    for _ in 0..reader.u2()? {
        found |= pool.utf8(skip_annotation(reader)?) == Some(GENERATED);
    }
    Some(found)
}

/// How many bytes the instruction at `pc` takes.
fn width(code: &[u8], pc: usize) -> Option<usize> {
    let opcode = *code.get(pc)?;
    let word = |at: usize| code.get(at..at + 4).map(|bytes| i32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]));
    Some(match opcode {
        0x10 | 0x12 | 0x15..=0x19 | 0x36..=0x3a | 0xa9 | 0xbc => 2,
        0x11 | 0x13 | 0x14 | 0x84 | 0x99..=0xa8 | 0xb2..=0xb8 | 0xbb | 0xbd | 0xc0 | 0xc1 | 0xc6 | 0xc7 => 3,
        0xc5 => 4,
        0xb9 | 0xba | 0xc8 | 0xc9 => 5,
        0xc4 => if *code.get(pc + 1)? == 0x84 { 6 } else { 4 },
        0xaa => {
            let base = (pc + 4) & !3;
            let (low, high) = (word(base + 4)?, word(base + 8)?);
            base + 12 + usize::try_from(i64::from(high) - i64::from(low) + 1).ok()? * 4 - pc
        }
        0xab => {
            let base = (pc + 4) & !3;
            base + 8 + usize::try_from(word(base + 4)?).ok()? * 8 - pc
        }
        _ => 1,
    })
}

fn line_at(lines: &[(usize, usize)], pc: usize) -> usize {
    lines.iter().filter(|(start, _)| *start <= pc).max_by_key(|(start, _)| *start).map_or(0, |(_, line)| *line)
}

/// Reads a `Code` attribute: the field instructions with their lines, the lowest line and the first instruction's.
fn code(reader: &mut Reader, pool: &Pool, method: &mut CompiledMethod) -> Option<()> {
    reader.skip(4)?;
    let length = reader.u4()? as usize;
    let start = reader.at;
    reader.skip(length)?;
    let data = reader.data;
    let bytes = &data[start..start + length];
    let handlers = reader.u2()? as usize;
    reader.skip(handlers * 8)?;
    let mut lines = Vec::new();
    for _ in 0..reader.u2()? {
        let name = pool.utf8(reader.u2()?).unwrap_or_default();
        let size = reader.u4()? as usize;
        let end = reader.at + size;
        if name == b"LineNumberTable" {
            for _ in 0..reader.u2()? {
                lines.push((reader.u2()? as usize, reader.u2()? as usize));
            }
        }
        reader.at = end;
    }
    method.line = lines.iter().map(|(_, line)| *line).min();
    method.entry_line = (!lines.is_empty()).then(|| line_at(&lines, 0));
    let mut pc = 0;
    while pc < bytes.len() {
        let opcode = bytes[pc];
        if (0xb2..=0xb5).contains(&opcode) {
            let index = u16::from_be_bytes([*bytes.get(pc + 1)?, *bytes.get(pc + 2)?]);
            if let Some((owner, name)) = pool.member(index) {
                let (store, is_static) = (opcode == 0xb3 || opcode == 0xb5, opcode <= 0xb3);
                method.accesses.push(Access { owner, name, store, is_static, line: line_at(&lines, pc) });
            }
        } else if opcode == 0x2a || (opcode == 0x19 && bytes.get(pc + 1) == Some(&0)) {
            method.loads_this = true;
        } else if (0xb6..=0xb9).contains(&opcode) {
            let index = u16::from_be_bytes([*bytes.get(pc + 1)?, *bytes.get(pc + 2)?]);
            method.calls.extend(pool.call(index));
        }
        pc += width(bytes, pc)?;
    }
    Some(())
}

fn parse(data: &[u8]) -> Option<(String, CompiledClass)> {
    let mut reader = Reader { data, at: 0 };
    if reader.u4()? != 0xCAFE_BABE {
        return None;
    }
    reader.skip(4)?;
    let pool = pool(&mut reader)?;
    let access = reader.u2()?;
    let name = pool.class(reader.u2()?)?;
    reader.skip(2)?;
    let interfaces = reader.u2()? as usize;
    reader.skip(interfaces * 2)?;
    let mut class = CompiledClass { access, ..CompiledClass::default() };
    for _ in 0..reader.u2()? {
        let access = reader.u2()?;
        let (name, descriptor) = (pool.text(reader.u2()?)?, pool.text(reader.u2()?)?);
        let (mut constant, mut generated) = (false, false);
        for _ in 0..reader.u2()? {
            let attribute = pool.utf8(reader.u2()?).unwrap_or_default();
            constant |= attribute == b"ConstantValue";
            let size = reader.u4()? as usize;
            let end = reader.at + size;
            if attribute == b"RuntimeInvisibleAnnotations" {
                generated |= marked(&mut reader, &pool)?;
            }
            reader.at = end;
        }
        class.fields.push(CompiledField { name, descriptor, access, constant, generated });
    }
    for _ in 0..reader.u2()? {
        let access = reader.u2()?;
        let (name, descriptor) = (pool.text(reader.u2()?)?, pool.text(reader.u2()?)?);
        let mut method = CompiledMethod { name, descriptor, access, generated: false, line: None, entry_line: None, accesses: Vec::new(), calls: Vec::new(), loads_this: false };
        for _ in 0..reader.u2()? {
            let attribute = pool.utf8(reader.u2()?).unwrap_or_default();
            let size = reader.u4()? as usize;
            let end = reader.at + size;
            if attribute == b"Code" {
                code(&mut reader, &pool, &mut method)?;
            } else if attribute == b"RuntimeInvisibleAnnotations" {
                method.generated |= marked(&mut reader, &pool)?;
            }
            reader.at = end;
        }
        class.methods.push(method);
    }
    for _ in 0..reader.u2()? {
        let attribute = pool.utf8(reader.u2()?).unwrap_or_default();
        let size = reader.u4()? as usize;
        let end = reader.at + size;
        if attribute == b"RuntimeInvisibleAnnotations" {
            class.generated |= marked(&mut reader, &pool)?;
        } else if attribute == b"InnerClasses" {
            for _ in 0..reader.u2()? {
                let (inner, outer) = (pool.class(reader.u2()?), pool.class(reader.u2()?));
                reader.skip(2)?;
                let access = reader.u2()?;
                if inner.as_ref() == Some(&name) {
                    class.nested = Some(access);
                } else if outer.as_ref() == Some(&name) {
                    class.members.extend(inner);
                }
            }
        }
        reader.at = end;
    }
    Some((name, class))
}

fn class_files(directory: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(directory) else { return };
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if path.is_dir() {
            class_files(&path, out);
        } else if path.extension().is_some_and(|extension| extension == "class") {
            out.push(path);
        }
    }
}

/// Every class file under the directories, by binary name with dots. The first directory that holds a class wins.
pub fn read(directories: &[PathBuf]) -> HashMap<String, CompiledClass> {
    let mut files = Vec::new();
    for directory in directories {
        class_files(directory, &mut files);
    }
    let parsed: Vec<(String, CompiledClass)> = files
        .par_iter()
        .filter_map(|file| {
            let data = std::fs::read(file).ok()?;
            let (name, mut class) = parse(&data)?;
            if class.generated || class.methods.iter().any(|method| method.generated) {
                class.info = super::classfile::parse(&data);
            }
            Some((name, class))
        })
        .collect();
    let mut classes = HashMap::new();
    for (name, class) in parsed {
        classes.entry(name).or_insert(class);
    }
    classes
}

/// A method's erased parameter types the way SpotBugs prints them: simple binary names, `[]` for arrays.
pub fn shown_parameters(descriptor: &str) -> Vec<String> {
    let inside = descriptor.strip_prefix('(').and_then(|rest| rest.split_once(')')).map_or("", |(inside, _)| inside);
    let mut shown = Vec::new();
    let mut letters = inside.chars().peekable();
    while letters.peek().is_some() {
        let mut arrays = 0;
        while letters.next_if_eq(&'[').is_some() {
            arrays += 1;
        }
        let base = match letters.next() {
            Some('L') => {
                let name: String = letters.by_ref().take_while(|letter| *letter != ';').collect();
                name.rsplit('/').next().unwrap_or_default().to_string()
            }
            Some(letter) => primitive(letter).to_string(),
            None => break,
        };
        shown.push(format!("{base}{}", "[]".repeat(arrays)));
    }
    shown
}

fn primitive(letter: char) -> &'static str {
    match letter {
        'Z' => "boolean",
        'B' => "byte",
        'C' => "char",
        'S' => "short",
        'I' => "int",
        'J' => "long",
        'F' => "float",
        'D' => "double",
        _ => "void",
    }
}
