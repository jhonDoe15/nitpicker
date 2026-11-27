//! The messages of `no-unsafe-deserialization`, each with the name it is about.
pub fn rebuilds_code(name: &str) -> String {
    format!("`{name}` rebuilds functions from the data it reads, so a crafted payload runs code. Read the data as JSON, `JSON.parse(text)`, and check it against a schema (zod, valibot) into a typed value. An exception fits only when this process alone writes and reads the data.")
}

pub fn v8_clone() -> String {
    "`v8.deserialize(v8.serialize(value))` copies a value through the structured-clone bytes. Copy it with `structuredClone(value)`, which keeps `Map`, `Set`, `Date` and cycles and parses no bytes. An exception fits only when you need the v8 wire format here.".to_string()
}

pub fn yaml_legacy_load(name: &str) -> String {
    format!("`yaml.{name}` in js-yaml 3 loads with `DEFAULT_FULL_SCHEMA`, so `!!js/function` tags build functions from the text. Use `yaml.safeLoad(text)` (or pass `{{ schema: yaml.JSON_SCHEMA }}`), or upgrade to js-yaml 4 where `load` is safe, and check the result against a schema. An exception fits only when you need custom tags.")
}

pub fn v8_deserialize(name: &str) -> String {
    format!("`v8.{name}` trusts its bytes as a structured clone of the writer. Read untrusted input as JSON, `JSON.parse(text)`, and check it against a schema (zod, valibot). An exception fits only when this process alone writes and reads the bytes.")
}

pub fn runs_text(name: &str) -> String {
    format!("`{name}` runs text as code, and a vm context is not a security boundary. Do not execute data: look the behavior up in a table keyed by name, or read the data as JSON and check it against a schema. A fixed string literal is allowed. An exception fits only when the text is trusted and cannot be a literal.")
}

pub fn yaml_full_schema(name: &str) -> String {
    format!("`{name}` lets YAML tags build arbitrary objects and call functions. Load YAML with the default safe schema, `yaml.load(text)` in js-yaml 4 (`JSON_SCHEMA` or `CORE_SCHEMA` for plain data), and check the result against a schema. An exception fits only when you need custom tags.")
}

pub fn bson_functions(name: &str) -> String {
    format!("`{name}: true` compiles functions stored in the document, so a crafted document runs code. Leave it off and store plain data. An exception fits only when you must read stored functions.")
}

pub fn entity_expansion() -> String {
    "`noent: true` expands external XML entities, so a crafted document can read local files (XXE). Leave it off, which is the default, and parse the XML as data. An exception fits only when the XML is produced by this process.".to_string()
}
