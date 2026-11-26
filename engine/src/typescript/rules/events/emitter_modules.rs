//! `emitter-modules.mts`: the modules, functions and methods the rule knows, without the type-based tables.

pub type Modules = &'static [&'static str];

macro_rules! node {
    ($name:literal) => {
        &[$name, concat!("node:", $name)]
    };
}

pub struct EmitterSource {
    pub modules: Modules,
    pub factories: &'static [&'static str],
    pub constructors: &'static [&'static str],
    pub servers: &'static [&'static str],
}

pub struct Handler {
    pub modules: Modules,
    pub names: &'static [&'static str],
    pub owner: Option<&'static str>,
    pub first: bool,
}

const fn source(modules: Modules, factories: &'static [&'static str], constructors: &'static [&'static str], servers: &'static [&'static str]) -> EmitterSource {
    EmitterSource { modules, factories, constructors, servers }
}

const fn handler(modules: Modules, names: &'static [&'static str], owner: Option<&'static str>, first: bool) -> Handler {
    Handler { modules, names, owner, first }
}

pub static EMITTER_SOURCES: [EmitterSource; 13] = [
    source(node!("fs"), &["createReadStream", "createWriteStream"], &[], &[]),
    source(node!("net"), &["connect", "createConnection"], &["Socket"], &["createServer", "Server"]),
    source(node!("tls"), &["connect"], &["TLSSocket"], &["createServer", "Server"]),
    source(node!("dgram"), &["createSocket"], &[], &[]),
    source(&["http", "node:http", "https", "node:https"], &["request", "get"], &["ClientRequest"], &[]),
    source(node!("http2"), &["connect"], &[], &[]),
    source(node!("child_process"), &["spawn", "fork"], &[], &[]),
    source(
        node!("zlib"),
        &[
            "createGzip", "createGunzip", "createDeflate", "createInflate", "createDeflateRaw", "createInflateRaw", "createUnzip",
            "createBrotliCompress", "createBrotliDecompress",
        ],
        &[],
        &[],
    ),
    source(node!("worker_threads"), &[], &["Worker"], &[]),
    source(&["redis", "@redis/client"], &["createClient", "createCluster"], &[], &[]),
    source(&["pg"], &[], &["Client", "Pool"], &[]),
    source(&["ws"], &[], &["WebSocket", "default"], &[]),
    source(&["imapflow"], &[], &["ImapFlow"], &[]),
];

const LISTEN_METHODS: [&str; 5] = ["on", "once", "addListener", "prependListener", "prependOnceListener"];
const CHAINABLE_METHODS: [&str; 16] = [
    "on", "once", "addListener", "prependListener", "prependOnceListener", "setEncoding", "setTimeout", "setKeepAlive", "setNoDelay",
    "setMaxListeners", "pause", "resume", "ref", "unref", "cork", "uncork",
];
const CONSUMING_METHODS: [&str; 6] = ["toArray", "forEach", "reduce", "some", "every", "find"];

pub static HANDLING_CALLS: [Handler; 4] = [
    handler(&["stream", "node:stream", "stream/promises", "node:stream/promises"], &["pipeline", "finished"], None, false),
    handler(node!("events"), &["once", "on"], None, true),
    handler(node!("stream/consumers"), &["text", "json", "buffer", "arrayBuffer", "blob"], None, true),
    handler(&["@nestjs/common"], &["StreamableFile"], None, true),
];

pub static INPUT_READERS: [Handler; 1] = [handler(&["readline", "node:readline", "readline/promises", "node:readline/promises"], &["createInterface"], None, false)];

pub static HANDLING_STATICS: [Handler; 4] = [
    handler(node!("events"), &["once", "on"], Some("EventEmitter"), true),
    handler(node!("stream"), &["pipeline", "finished"], Some("promises"), false),
    handler(node!("stream"), &["from", "toWeb"], Some("Readable"), true),
    handler(node!("stream"), &["toWeb"], Some("Duplex"), true),
];

fn has(list: &[&str], name: Option<&str>) -> bool {
    name.is_some_and(|name| list.contains(&name))
}

pub fn is_connection_event(name: Option<&str>) -> bool {
    has(&["connection", "secureConnection"], name)
}

pub fn is_listen_method(name: Option<&str>) -> bool {
    has(&LISTEN_METHODS, name)
}

pub fn is_chainable_method(name: Option<&str>) -> bool {
    has(&CHAINABLE_METHODS, name)
}

pub fn is_consuming_method(name: Option<&str>) -> bool {
    has(&CONSUMING_METHODS, name)
}
