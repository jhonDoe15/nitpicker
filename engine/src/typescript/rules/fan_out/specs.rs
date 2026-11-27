//! `client-modules.mts`, the limiter specs of `bounds.mts` and `origins/module-refs.mts`: which modules make remote,
//! message and limiter clients, through which makers, types, functions and methods, and the local names that
//! stand for those modules.
use super::resolve::{name_of, skipped, static_key};
use crate::typescript::rules::events::names::bindings::{loaded_module, module_names};
use crate::typescript::rules::support::view::Node;
use std::collections::{HashMap, HashSet};

pub type Valid = fn(Option<Node>) -> bool;

#[derive(Clone, Copy, PartialEq)]
pub enum Kind {
    Remote,
    Message,
    Limiter,
}

#[derive(Clone)]
pub struct ClientSpec {
    pub kind: Kind,
    /// `None` stands for `'*'`: every method.
    pub methods: Option<Vec<&'static str>>,
    pub makers: Vec<&'static str>,
    pub types: Vec<&'static str>,
    pub functions: Vec<&'static str>,
    pub derivers: Vec<&'static str>,
    pub callable: bool,
    pub deep: bool,
    /// `/Client$/` of the AWS clients, as a suffix.
    pub suffix: Option<&'static str>,
    pub valid: Option<Valid>,
}

pub type SpecOf = fn(&str) -> Option<ClientSpec>;

const REQUEST: &str = "request";
const PUBLISH: &str = "publish";
const CONNECT: &str = "connect";
const DEFAULT: &str = "default";
const HTTP_METHODS: [&str; 11] = [REQUEST, "get", "delete", "head", "options", "post", "put", "patch", "postForm", "putForm", "patchForm"];
const BODY_METHODS: [&str; 6] = ["get", "post", "put", "patch", "delete", "head"];
const GOT_METHODS: [&str; 7] = ["get", "post", "put", "patch", "delete", "head", "stream"];
const FETCH_FUNCTIONS: [&str; 3] = ["fetch", "ofetch", "$fetch"];
const REDIS_PUBLISH: [&str; 3] = [PUBLISH, "spublish", "sPublish"];
const FETCH_MODULES: [&str; 5] = ["cross-fetch", "isomorphic-fetch", "isomorphic-unfetch", "node-fetch", "ofetch"];
const HTTP_MODULES: [&str; 4] = ["http", "node:http", "https", "node:https"];
const MESSAGE_SERVICES: [&str; 5] = ["client-sqs", "client-sns", "client-eventbridge", "client-kinesis", "client-firehose"];
const INFINITE: &str = "Infinity";

fn client(kind: Kind) -> ClientSpec {
    ClientSpec {
        kind,
        methods: Some(Vec::new()),
        makers: Vec::new(),
        types: Vec::new(),
        functions: Vec::new(),
        derivers: Vec::new(),
        callable: false,
        deep: false,
        suffix: None,
        valid: None,
    }
}

fn http(methods: &[&'static str], makers: &[&'static str], types: &[&'static str]) -> ClientSpec {
    ClientSpec { callable: true, methods: Some(methods.to_vec()), makers: makers.to_vec(), types: types.to_vec(), ..client(Kind::Remote) }
}

fn sdk(makers: &[&'static str]) -> ClientSpec {
    ClientSpec { methods: None, deep: true, makers: makers.to_vec(), ..client(Kind::Remote) }
}

fn message(methods: &[&'static str], makers: &[&'static str], derivers: &[&'static str], types: &[&'static str]) -> ClientSpec {
    ClientSpec { methods: Some(methods.to_vec()), makers: makers.to_vec(), derivers: derivers.to_vec(), types: types.to_vec(), ..client(Kind::Message) }
}

/// `clientSpec`.
pub fn client_spec(source: &str) -> Option<ClientSpec> {
    if let Some(service) = source.strip_prefix("@aws-sdk/").filter(|rest| rest.starts_with("client-")) {
        if service.ends_with("client-dynamodb") {
            return None;
        }
        let kind = if MESSAGE_SERVICES.iter().any(|name| service.ends_with(name)) { Kind::Message } else { Kind::Remote };
        return Some(ClientSpec { methods: Some(vec!["send"]), suffix: Some("Client"), ..client(kind) });
    }
    let mut body = BODY_METHODS.to_vec();
    Some(match source {
        "axios" => http(&HTTP_METHODS, &["create"], &["AxiosInstance", "AxiosStatic"]),
        "got" => http(&[GOT_METHODS.as_slice(), &["paginate"]].concat(), &["extend"], &["Got"]),
        "ky" => http(&BODY_METHODS, &["create", "extend"], &["KyInstance"]),
        "superagent" => http(&BODY_METHODS, &["agent"], &[]),
        "needle" => {
            body.push(REQUEST);
            http(&body, &[], &[])
        }
        "undici" => ClientSpec {
            functions: vec!["fetch", REQUEST, "stream"],
            methods: Some(vec![REQUEST, "stream"]),
            makers: vec!["Client", "Pool", "Agent"],
            types: vec!["Dispatcher"],
            ..client(Kind::Remote)
        },
        "@nestjs/axios" => {
            body.push(REQUEST);
            ClientSpec { methods: Some(body), makers: vec!["HttpService"], types: vec!["HttpService"], ..client(Kind::Remote) }
        }
        "@angular/common/http" => {
            body.extend(["options", REQUEST, "jsonp"]);
            ClientSpec { methods: Some(body), types: vec!["HttpClient"], ..client(Kind::Remote) }
        }
        "rxjs/ajax" => {
            body.push("getJSON");
            ClientSpec { callable: true, functions: vec!["ajax"], methods: Some(body), ..client(Kind::Remote) }
        }
        "graphql-request" => ClientSpec {
            functions: vec![REQUEST, "rawRequest"],
            methods: Some(vec![REQUEST, "rawRequest"]),
            makers: vec!["GraphQLClient"],
            ..client(Kind::Remote)
        },
        "openai" => sdk(&[DEFAULT, "OpenAI"]),
        "@anthropic-ai/sdk" => sdk(&[DEFAULT, "Anthropic"]),
        "stripe" => sdk(&[DEFAULT, "Stripe"]),
        "@octokit/rest" | "octokit" => sdk(&["Octokit"]),
        "@slack/web-api" => sdk(&["WebClient"]),
        "kafkajs" => message(&["send", "sendBatch"], &["Kafka"], &["producer"], &["Producer"]),
        "amqplib" => message(&[PUBLISH, "sendToQueue"], &[CONNECT], &["createChannel", "createConfirmChannel"], &["Channel", "ConfirmChannel"]),
        "amqp-connection-manager" => message(&[PUBLISH, "sendToQueue"], &[CONNECT], &["createChannel"], &["ChannelWrapper"]),
        "nats" => message(&[PUBLISH], &[CONNECT], &[], &[]),
        "ioredis" => message(&REDIS_PUBLISH, &[DEFAULT, "Redis", "Cluster"], &[], &["Redis", "Cluster"]),
        "redis" => message(&REDIS_PUBLISH, &["createClient", "createCluster"], &[], &["RedisClientType", "RedisClusterType"]),
        "@google-cloud/pubsub" => message(&[PUBLISH, "publishMessage", "publishJSON"], &["PubSub"], &["topic"], &["Topic"]),
        "bullmq" => message(&["add", "addBulk"], &["Queue"], &[], &[]),
        "bull" => message(&["add", "addBulk"], &[DEFAULT], &[], &[]),
        "mqtt" => message(&[PUBLISH, "publishAsync"], &[CONNECT, "connectAsync"], &[], &[]),
        "@azure/service-bus" => message(&["sendMessages"], &["ServiceBusClient"], &["createSender"], &[]),
        _ if FETCH_MODULES.contains(&source) => ClientSpec { callable: true, functions: FETCH_FUNCTIONS.to_vec(), ..client(Kind::Remote) },
        _ if HTTP_MODULES.contains(&source) => ClientSpec { functions: vec![REQUEST, "get"], ..client(Kind::Remote) },
        _ => return None,
    })
}

fn arguments(creation: Option<Node>) -> Vec<Node> {
    creation.map(|creation| creation.nodes("arguments")).unwrap_or_default()
}

fn has_limit_argument(creation: Option<Node>) -> bool {
    arguments(creation).first().is_some_and(|first| name_of(Some(*first)).as_deref() != Some(INFINITE))
}

/// `hasProperty`: an object literal with a property of this name whose value is not `Infinity`.
pub fn has_property(object: Option<Node>, name: &str) -> bool {
    let Some(target) = object.map(skipped).filter(|target| target.is("ObjectExpression")) else { return false };
    let found = target.nodes("properties").into_iter().find(|property| property.is("Property") && name_of(property.node("key")).as_deref() == Some(name));
    found.is_some_and(|found| name_of(found.node("value")).as_deref() != Some(INFINITE))
}

fn first_argument(creation: Option<Node>) -> Option<Node> {
    arguments(creation).first().copied()
}

fn limiter(makers: &[&'static str], valid: Valid, types: &[&'static str]) -> ClientSpec {
    ClientSpec { methods: None, makers: makers.to_vec(), types: types.to_vec(), valid: Some(valid), ..client(Kind::Limiter) }
}

/// The limiter specs of `bounds.mts`.
pub fn limiter_spec(source: &str) -> Option<ClientSpec> {
    Some(match source {
        "p-limit" => limiter(&[DEFAULT], has_limit_argument, &["LimitFunction"]),
        "p-queue" => limiter(&[DEFAULT], |creation| has_property(first_argument(creation), "concurrency"), &[]),
        "bottleneck" => limiter(&[DEFAULT], |creation| has_property(first_argument(creation), "maxConcurrent"), &[]),
        "p-throttle" => limiter(&[DEFAULT], |creation| has_property(first_argument(creation), "limit"), &[]),
        "async-sema" => limiter(&["Sema", "RateLimit"], has_limit_argument, &[]),
        "async-mutex" => limiter(&["Semaphore", "Mutex"], |_| true, &[]),
        "p-map" => limiter(&[], |_| false, &[]),
        "limiter" => limiter(&["RateLimiter"], |creation| first_argument(creation).is_some(), &[]),
        _ => return None,
    })
}

impl ClientSpec {
    pub fn matches_maker(&self, name: Option<&str>) -> bool {
        name.is_some_and(|name| self.makers.contains(&name) || self.suffix.is_some_and(|suffix| name.ends_with(suffix)))
    }

    pub fn matches_type(&self, name: Option<&str>) -> bool {
        name.is_some_and(|name| self.makers.contains(&name) || self.types.contains(&name) || self.suffix.is_some_and(|suffix| name.ends_with(suffix)))
    }

    pub fn has_method(&self, name: &str) -> bool {
        self.methods.as_ref().is_none_or(|methods| methods.contains(&name))
    }
}

#[derive(Clone)]
pub struct Ref {
    pub source: String,
    pub imported: Option<String>,
}

pub struct Entry {
    pub source: String,
    pub named: HashMap<String, String>,
    pub namespaces: HashSet<String>,
}

fn add_loaded(entry: &mut Entry, declarator: Node) {
    let Some(id) = declarator.node("id") else { return };
    if id.is("Identifier") {
        entry.namespaces.insert(name_of(Some(id)).unwrap_or_default());
        return;
    }
    let properties = if id.is("ObjectPattern") { id.nodes("properties") } else { Vec::new() };
    for property in properties.into_iter().filter(|property| property.is("Property")) {
        let key = static_key(property);
        let value = property.node("value").filter(|value| value.is("Identifier"));
        match (key, value) {
            (Some(key), Some(value)) if key == DEFAULT => {
                entry.namespaces.insert(name_of(Some(value)).unwrap_or_default());
            }
            (Some(key), Some(value)) => {
                entry.named.insert(name_of(Some(value)).unwrap_or_default(), key);
            }
            _ => {}
        }
    }
}

pub fn module_entries(program: Node, spec_of: SpecOf) -> Vec<Entry> {
    let declarators: Vec<(Node, Option<String>)> =
        program.estree_descendants().into_iter().filter(|node| node.is("VariableDeclarator")).map(|node| (node, loaded_module(node.node("init")))).collect();
    let imports = program.nodes("body").into_iter().filter(|statement| statement.is("ImportDeclaration")).filter_map(|statement| statement.node("source")?.text("value").map(|text| text.into_owned()));
    let mut sources: Vec<String> = Vec::new();
    for source in imports.chain(declarators.iter().filter_map(|(_, source)| source.clone())) {
        if spec_of(&source).is_some() && !sources.contains(&source) {
            sources.push(source);
        }
    }
    sources
        .into_iter()
        .map(|source| {
            let (named, namespaces) = module_names(program, &[source.as_str()]);
            let mut entry = Entry { source: source.clone(), named, namespaces };
            for (declarator, _) in declarators.iter().filter(|(_, loaded)| loaded.as_deref() == Some(source.as_str())) {
                add_loaded(&mut entry, *declarator);
            }
            entry
        })
        .collect()
}

pub fn type_imports(program: Node, spec_of: SpecOf) -> HashMap<String, Ref> {
    let mut found = HashMap::new();
    for statement in program.nodes("body").into_iter().filter(|statement| statement.is("ImportDeclaration")) {
        let Some(source) = statement.node("source").and_then(|source| source.text("value")).map(|text| text.into_owned()) else { continue };
        if spec_of(&source).is_none() {
            continue;
        }
        for specifier in statement.nodes("specifiers") {
            let imported = if specifier.is("ImportSpecifier") { name_of(specifier.node("imported")) } else { Some(DEFAULT.to_string()) };
            found.insert(name_of(specifier.node("local")).unwrap_or_default(), Ref { source: source.clone(), imported });
        }
    }
    found
}

/// `annotationOf`: the node's `typeAnnotation` when it is a `TSTypeAnnotation`.
pub fn annotation_of(node: Node) -> Option<Node> {
    node.node("typeAnnotation").filter(|annotation| annotation.is("TSTypeAnnotation"))
}

/// `typeName`: (owner, name) of the type reference an annotation writes, one wrapper deep.
pub fn type_name(annotation: Option<Node>) -> Option<(Option<String>, Option<String>)> {
    let outer = annotation?.node("typeAnnotation");
    let reference = outer.and_then(|outer| outer.node("typeAnnotation")).or(outer);
    let name = reference.filter(|reference| reference.is("TSTypeReference"))?.node("typeName")?;
    if name.is("TSQualifiedName") {
        return Some((name_of(name.node("left")), name_of(name.node("right"))));
    }
    name.is("Identifier").then(|| (None, name_of(Some(name))))
}
