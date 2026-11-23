use std::collections::HashMap;

pub const OBJECT: &str = "java.lang.Object";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WildcardKind {
    Extends,
    Super,
}

/// A type as written: class types keep their type arguments, members keep their type variables.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Type {
    Primitive(&'static str),
    Class(String, Vec<Type>),
    Array(Box<Type>),
    Variable(String),
    /// An unbounded wildcard argument: stands for the bound of the parameter it fills.
    Wildcard,
    Bounded(WildcardKind, Box<Type>),
    Null,
}

impl Type {
    pub fn class(name: &str) -> Type {
        Type::Class(name.to_string(), Vec::new())
    }
    pub fn unwrap_bound(&self) -> &Type {
        match self {
            Type::Bounded(_, bound) => bound.unwrap_bound(),
            other => other,
        }
    }
    pub fn name(&self) -> String {
        match self {
            Type::Primitive(name) => (*name).to_string(),
            Type::Class(name, _) | Type::Variable(name) => name.clone(),
            Type::Array(element) => format!("{}[]", element.name()),
            Type::Null => "null".to_string(),
            Type::Wildcard => OBJECT.to_string(),
            Type::Bounded(_, bound) => bound.name(),
        }
    }
    /// The same type without type arguments. Variables are expected to be replaced before this.
    pub fn erased(&self) -> Type {
        match self {
            Type::Class(name, _) => Type::class(name.split('&').next().unwrap_or(name)),
            Type::Array(element) => Type::Array(Box::new(element.erased())),
            Type::Variable(_) | Type::Wildcard => Type::class(OBJECT),
            Type::Bounded(_, bound) => bound.erased(),
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
            Type::Bounded(kind, bound) => Type::Bounded(*kind, Box::new(bound.substitute(map))),
            other => other.clone(),
        }
    }
    /// Still a type variable at the top, so nothing is known about the value's class.
    pub fn open(&self) -> bool {
        match self {
            Type::Variable(_) => true,
            Type::Array(element) | Type::Bounded(_, element) => element.open(),
            _ => false,
        }
    }
    pub fn mentions_variable(&self) -> bool {
        match self {
            Type::Variable(_) => true,
            Type::Class(_, arguments) => arguments.iter().any(Type::mentions_variable),
            Type::Array(element) | Type::Bounded(_, element) => element.mentions_variable(),
            _ => false,
        }
    }
    /// The primitive a wrapper class stands for; any other type as it is.
    pub fn unboxed_or_same(self) -> Type {
        let primitive = match self.unwrap_bound() {
            Type::Class(name, _) => match name.as_str() {
                "java.lang.Integer" => "int",
                "java.lang.Long" => "long",
                "java.lang.Short" => "short",
                "java.lang.Byte" => "byte",
                "java.lang.Character" => "char",
                "java.lang.Double" => "double",
                "java.lang.Float" => "float",
                "java.lang.Boolean" => "boolean",
                _ => return self,
            },
            _ => return self,
        };
        Type::Primitive(primitive)
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
    pub const FINAL: u32 = 1;
    pub const PUBLIC: u32 = 2;
    pub const PROTECTED: u32 = 4;
    pub const STATIC: u32 = 8;
    pub const ABSTRACT: u32 = 16;
    pub const ENUM: u32 = 32;
    pub const RECORD: u32 = 64;
    pub const SEALED: u32 = 128;
    /// Carries `@java.lang.Deprecated`.
    pub const DEPRECATED: u32 = 256;
    pub const ANNOTATION: u32 = 512;
    /// A member class only its outer class sees.
    pub const PRIVATE: u32 = 1024;
    /// Carries an annotation named `CheckReturnValue` or `MustUseReturnValues`; set for packages too.
    pub const CHECK_RESULT: u32 = 2048;
    /// Carries an annotation named `CanIgnoreReturnValue` or `IgnorableReturnValue`.
    pub const IGNORE_RESULT: u32 = 4096;
    /// A class with `@AutoValue`.
    pub const AUTO_VALUE: u32 = 8192;
    /// A class with `@AutoValue.Builder` or `@AutoBuilder`.
    pub const AUTO_BUILDER: u32 = 16384;
    /// A class with one of Dagger's component builder annotations.
    pub const DAGGER_BUILDER: u32 = 32768;
    /// Carries Error Prone's own `@CanIgnoreReturnValue`.
    pub const MAY_IGNORE: u32 = 1 << 16;
    /// Carries an annotation named `Keep` or `UsedReflectively`.
    pub const KEPT: u32 = 1 << 17;
    /// Carries Error Prone's `@Immutable`.
    pub const IMMUTABLE: u32 = 1 << 18;
    /// A field or a method's result carries an annotation named `Nullable` or `CheckForNull`.
    pub const NULLABLE: u32 = 1 << 19;
    /// The class comes from a source file of the run, not from the class path.
    pub const SOURCE: u32 = 1 << 20;
    /// A field or a method's result carries `@CheckForNull`, or an annotation that is a nickname for it. On an
    /// annotation class: the class itself carries `@CheckForNull`, which makes it such a nickname.
    pub const CHECK_FOR_NULL: u32 = 1 << 21;
    /// A member read from a class file carries an annotation that may be such a nickname: one of the
    /// class's `null_nicknames`.
    pub const MAYBE_CHECK_FOR_NULL: u32 = 1 << 22;
    /// A `volatile` field.
    pub const VOLATILE: u32 = 1 << 23;
    /// A class or a package carries an annotation named `NullMarked`: NullAway checks its code.
    pub const NULL_MARKED: u32 = 1 << 24;
    /// A class or a package carries an annotation named `NullUnmarked`.
    pub const NULL_UNMARKED: u32 = 1 << 25;
    /// A class file with type annotations on the class or a member: nullness written that way is not read.
    pub const TYPE_MARKS: u32 = 1 << 26;

    pub const IMMUTABLE_NAME: &str = "com.google.errorprone.annotations.Immutable";
    pub const IMMUTABLE_PARAMETER_NAME: &str = "com.google.errorprone.annotations.ImmutableTypeParameter";

    /// The bits an annotation gives, by its full name with `.` between a class and its member class.
    pub fn of_annotation(name: &str) -> u32 {
        match name {
            "com.google.auto.value.AutoValue" => return AUTO_VALUE,
            "com.google.auto.value.AutoValue.Builder" | "com.google.auto.value.AutoBuilder" => return AUTO_BUILDER,
            "dagger.Component.Builder"
            | "dagger.Subcomponent.Builder"
            | "dagger.producers.ProductionComponent.Builder"
            | "dagger.producers.ProductionSubcomponent.Builder" => return DAGGER_BUILDER,
            _ => {}
        }
        let exact = match name {
            "com.google.errorprone.annotations.CanIgnoreReturnValue" => MAY_IGNORE,
            IMMUTABLE_NAME => IMMUTABLE,
            _ => 0,
        };
        exact | match name.rsplit('.').next().unwrap_or(name) {
            "CheckReturnValue" | "MustUseReturnValues" => CHECK_RESULT,
            "CanIgnoreReturnValue" | "IgnorableReturnValue" => IGNORE_RESULT,
            "Keep" | "UsedReflectively" => KEPT,
            "NullMarked" => NULL_MARKED,
            "NullUnmarked" => NULL_UNMARKED,
            _ => 0,
        }
    }
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
    pub flags: u32,
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
    pub flags: u32,
    /// What the `throws` clause lists, type variables kept.
    pub throws: Vec<Type>,
    /// Parameter names, when the source or the class file gives them; empty otherwise.
    pub names: Vec<String>,
    pub detail: Detail,
    /// The parameter types as javac prints them in a method's name: qualified, with type arguments, comma separated.
    pub shown: String,
    /// Bit per parameter position that is marked nullable.
    pub nullable_parameters: u64,
    /// The text of a `@Contract` annotation on the method; empty without one.
    pub contract: String,
    /// Marked as run right after construction: an annotation named `Initializer` or one of `STARTERS`.
    pub starts: bool,
}

/// What javac's method symbol gives beyond its signature: modifiers and annotations as written, for checks that compare
/// an override with the method it overrides.
#[derive(Clone, Debug, Default)]
pub struct Detail {
    /// Access bits as in a class file: public, private, protected, static, final, synchronized, native, abstract, strictfp.
    pub access: u16,
    /// Full names of the annotations on the method, and on each parameter, with `.` before a member class.
    pub annotations: Vec<String>,
    pub parameter_annotations: Vec<Vec<String>>,
}

/// Where an annotation type may be used, as bits of `ClassInfo::targets`, from its `@Target`.
pub mod target {
    pub const NAMES: &[&str] = &[
        "TYPE", "FIELD", "METHOD", "PARAMETER", "CONSTRUCTOR", "LOCAL_VARIABLE", "ANNOTATION_TYPE", "PACKAGE", "TYPE_PARAMETER", "TYPE_USE", "MODULE",
        "RECORD_COMPONENT",
    ];
    pub fn bit(name: &str) -> u16 {
        NAMES.iter().position(|known| *known == name).map_or(0, |at| 1 << at)
    }
}

/// Annotations that make a method an initializer for NullAway: its defaults and the project's own list.
pub const STARTERS: &[&str] = &[
    "jakarta.annotation.PostConstruct",
    "javax.annotation.PostConstruct",
    "org.junit.Before",
    "org.junit.BeforeClass",
    "org.junit.jupiter.api.BeforeAll",
    "org.junit.jupiter.api.BeforeEach",
    "org.springframework.beans.factory.annotation.Autowired",
];

#[derive(Clone, Debug, Default)]
pub struct ClassInfo {
    pub name: String,
    pub package: String,
    pub superclass: Option<String>,
    pub interfaces: Vec<String>,
    pub generic_supers: Vec<Type>,
    /// Name and erased bound of each type parameter.
    pub type_parameters: Vec<(String, Type)>,
    /// The first bound of each type parameter with its type arguments, when a class file gives it.
    pub written_bounds: Vec<Type>,
    pub fields: Vec<Field>,
    pub methods: Vec<Method>,
    pub is_interface: bool,
    /// For an enum: how many constants it declares.
    pub enum_constants: Option<u32>,
    /// For a sealed class or interface: the classes it permits.
    pub permitted: Option<Vec<String>>,
    /// For a record: the generic type of each component, in order.
    pub record_components: Option<Vec<Type>>,
    /// For an annotation type with `@Target`: the bits of `target` it lists.
    pub targets: Option<u16>,
    pub flags: u32,
    /// The type parameters that `containerOf` of the class's `@Immutable` names.
    pub container_of: Vec<String>,
    /// The type parameters marked `@ImmutableTypeParameter`.
    pub immutable_parameters: Vec<String>,
    /// Declares an instance method, of any visibility, whose name starts like a setter and that does not
    /// return the class itself.
    pub setter_like: bool,
    /// For a class read from a class file: the annotation classes on its members that may be nicknames for
    /// `@CheckForNull`.
    pub null_nicknames: Vec<String>,
}

const SETTER_STARTS: &[&str] =
    &["set", "put", "add", "insert", "delete", "remove", "erase", "clear", "push", "pop", "enqueue", "dequeue", "write", "append", "replace"];

pub fn setter_name(name: &str) -> bool {
    SETTER_STARTS.iter().any(|start| name.starts_with(start))
}
