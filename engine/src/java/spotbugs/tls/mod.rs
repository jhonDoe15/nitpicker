//! FindSecBugs' detectors of TLS, sockets, mail and LDAP settings: WeakTrustManagerDetector (`trust`, with the code
//! test of `trivial`), UnencryptedSocketDetector, UnencryptedServerSocketDetector and WeakTLSDetector's
//! DEFAULT_HTTP_CLIENT (`sockets`), InsecureSmtpSslDetector (`smtp`), and WeakTLSDetector's SSL_CONTEXT and
//! LdapEntryPoisoningDetector (`values`, run with the crypto calls since they judge the same kind of value).
//! AnonymousLdapDetector only reports at priority 3.
mod smtp;
mod sockets;
mod trivial;
mod trust;
pub mod values;

use super::Context;
use super::idioms::compiled;
use tree_sitter::Node;

pub const PATTERNS: &[&str] = &[trust::MANAGER, trust::VERIFIER, sockets::SOCKET, sockets::SERVER, sockets::CLIENT, smtp::SMTP, values::CONTEXT, values::POISONING];

const MARKS: &[&str] = &["TrustManager", "HostnameVerifier", "Socket", "DefaultHttpClient", "setSSLOnConnect"];

pub fn tls<'a>(context: &Context<'a>, declared: &[Node<'a>]) {
    if !context.wants(&PATTERNS[..6]) || !MARKS.iter().any(|mark| context.file.text.contains(mark)) {
        return;
    }
    for class in declared.iter().copied() {
        let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { continue };
        let methods = compiled(context, &own, class);
        trust::check(context, &own, class, &methods);
        sockets::check(context, &own, class, &methods);
        smtp::check(context, &own, &methods);
    }
}
