use std::collections::HashMap;

pub const OBJECT: &str = "java.lang.Object";

/// A type as written: class types keep their type arguments, members keep their type variables.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Type {
    Primitive(&'static str),
    Class(String, Vec<Type>),
    Array(Box<Type>),
    Variable(String),
    /// An unbounded wildcard argument: stands for the bound of the parameter it fills.
    Wildcard,
    Null,
}

impl Type {
    pub fn class(name: &str) -> Type {
        Type::Class(name.to_string(), Vec::new())
    }
    pub fn name(&self) -> String {
        match self {
            Type::Primitive(name) => (*name).to_string(),
            Type::Class(name, _) | Type::Variable(name) => name.clone(),
            Type::Array(element) => format!("{}[]", element.name()),
            Type::Null => "null".to_string(),
            Type::Wildcard => OBJECT.to_string(),
        }
    }
    /// The same type without type arguments. Variables are expected to be replaced before this.
    pub fn erased(&self) -> Type {
        match self {
            Type::Class(name, _) => Type::class(name.split('&').next().unwrap_or(name)),
            Type::Array(element) => Type::Array(Box::new(element.erased())),
            Type::Variable(_) | Type::Wildcard => Type::class(OBJECT),
            other => other.clone(),
        }
    }
    pub fn substitute(&self, map: &HashMap<String, Type>) -> Type {
        match self {
            Type::Variable(name) => map.get(name).cloned().unwrap_or_else(|| self.clone()),
            Type::Class(name, arguments) => {
                Type::Class(name.clone(), arguments.iter().map(|argument| argument.substitute(map)).collect())
            }
            Type::Array(element) => Type::Array(Box::new(element.substitute(map))),
            other => other.clone(),
        }
    }
    /// Still a type variable at the top, so nothing is known about the value's class.
    pub fn open(&self) -> bool {
        match self {
            Type::Variable(_) => true,
            Type::Array(element) => element.open(),
            _ => false,
        }
    }
    pub fn mentions_variable(&self) -> bool {
        match self {
            Type::Variable(_) => true,
            Type::Class(_, arguments) => arguments.iter().any(Type::mentions_variable),
            Type::Array(element) => element.mentions_variable(),
            _ => false,
        }
    }
    pub fn boxed(self) -> Type {
        match self {
            Type::Primitive(name) => Type::class(match name {
                "int" => "java.lang.Integer",
                "long" => "java.lang.Long",
                "short" => "java.lang.Short",
                "byte" => "java.lang.Byte",
                "char" => "java.lang.Character",
                "double" => "java.lang.Double",
                "float" => "java.lang.Float",
                "boolean" => "java.lang.Boolean",
                _ => "java.lang.Void",
            }),
            other => other,
        }
    }
}

/// Facts about a class, method or field beyond what type resolution needs, as bits of `flags`.
pub mod flag {
    pub const FINAL: u16 = 1;
    pub const PUBLIC: u16 = 2;
    pub const PROTECTED: u16 = 4;
    pub const STATIC: u16 = 8;
    pub const ABSTRACT: u16 = 16;
    pub const ENUM: u16 = 32;
    pub const RECORD: u16 = 64;
    pub const SEALED: u16 = 128;
    /// Carries `@java.lang.Deprecated`.
    pub const DEPRECATED: u16 = 256;
    pub const ANNOTATION: u16 = 512;
    /// A field or a method's result carries an annotation named `Nullable` or `CheckForNull`.
    pub const NULLABLE: u16 = 1024;
}

#[derive(Clone, Debug)]
pub struct Field {
    pub name: String,
    /// Erased type, as in the class file descriptor.
    pub kind: Type,
    pub generic: Type,
    pub constant: Option<String>,
    /// Set for a final field whose initializer is a constant expression as long as each listed field
    /// (owner class, name; an empty owner means the classes around the field) is a constant too.
    pub fixed: Option<Vec<(String, String)>>,
    /// The field is a constant for the compiler too: a primitive or a string, and no array.
    pub strict: bool,
    /// Not seen from subclasses.
    pub is_private: bool,
    pub flags: u16,
}

#[derive(Clone, Debug)]
pub struct Method {
    pub name: String,
    /// Erased parameter and return types, as in the class file descriptor.
    pub parameters: Vec<Type>,
    pub returns: Type,
    pub generic_parameters: Vec<Type>,
    pub generic_returns: Type,
    pub type_parameters: Vec<String>,
    /// Erased bound of each type parameter, in the same order.
    pub type_bounds: Vec<Type>,
    /// Visible only inside its own package.
    pub package_private: bool,
    pub is_abstract: bool,
    pub is_static: bool,
    /// Not inherited.
    pub is_private: bool,
    pub varargs: bool,
    pub flags: u16,
}

#[derive(Clone, Debug, Default)]
pub struct ClassInfo {
    pub name: String,
    pub package: String,
    pub superclass: Option<String>,
    pub interfaces: Vec<String>,
    pub generic_supers: Vec<Type>,
    /// Name and erased bound of each type parameter.
    pub type_parameters: Vec<(String, Type)>,
    pub fields: Vec<Field>,
    pub methods: Vec<Method>,
    pub is_interface: bool,
    /// For an enum: how many constants it declares.
    pub enum_constants: Option<u32>,
    /// For a sealed class or interface: the classes it permits.
    pub permitted: Option<Vec<String>>,
    pub flags: u16,
}
