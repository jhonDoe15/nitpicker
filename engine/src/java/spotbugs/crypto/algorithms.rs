//! What FindSecBugs reports for an algorithm name, measured on test code:
//! - `MessageDigest.getInstance`, Commons Codec `DigestUtils.getDigest(String)`: the name in capitals is `MD2`,
//!   `MD4` or `MD5` (WEAK_MESSAGE_DIGEST_MD5, priority 1) or `SHA`, `SHA1` or `SHA-1` (WEAK_MESSAGE_DIGEST_SHA1,
//!   priority 2). `Signature.getInstance` judges the part before the first `with` the same way.
//! - `Cipher.getInstance`: CIPHER_INTEGRITY (priority 1) unless the name starts with `RSA`, is `ECIES`, or holds
//!   `/GCM/`, `/CCM/`, `/EAX/`, `/OCB/`, `/CWC/` or `/GCM-SIV/`; ECB_MODE (priority 1) for `AES`, `DES` or `DESede`
//!   alone or followed by `/ECB/`; PADDING_ORACLE (priority 1) when it holds `/CBC/PKCS5Padding`.
//! - `Cipher.getInstance` and `KeyGenerator.getInstance`: DES_USAGE (priority 2) for `DES` or a name starting with
//!   `DES/`, in any case; RSA_NO_PADDING (priority 2) for a name starting with `RSA/` and ending with `/NoPadding`.
//!   TDES_USAGE is priority 3, so a `-medium` run never shows it.
//!
//! The other comparisons are exact, case included.

pub const INTEGRITY: &str = "CIPHER_INTEGRITY";
pub const ECB: &str = "ECB_MODE";
pub const ORACLE: &str = "PADDING_ORACLE";
pub const DES: &str = "DES_USAGE";
pub const RSA: &str = "RSA_NO_PADDING";
pub const MD5: &str = "WEAK_MESSAGE_DIGEST_MD5";
pub const SHA1: &str = "WEAK_MESSAGE_DIGEST_SHA1";

/// What a call does with its algorithm name.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Use {
    Digest,
    Signature,
    Cipher,
    KeyGenerator,
}

pub struct Hit {
    pub pattern: &'static str,
    pub message: String,
    pub priority: u8,
    pub arguments: Vec<String>,
}

fn hit(pattern: &'static str, message: &str, priority: u8) -> Hit {
    Hit { pattern, message: message.to_string(), priority, arguments: Vec::new() }
}

/// The findings of a digest named by its algorithm, such as `MD5` or `SHA-1`.
pub fn digest(name: &str) -> Option<Hit> {
    let upper = name.to_uppercase();
    let (pattern, family, priority) = match upper.as_str() {
        "MD2" | "MD4" | "MD5" => (MD5, "MDX", 1),
        "SHA" | "SHA1" | "SHA-1" => (SHA1, "SHA-1", 2),
        _ => return None,
    };
    let message = format!("This API {upper} ({family}) is not a recommended cryptographic hash function");
    Some(Hit { pattern, message, priority, arguments: vec![upper] })
}

const SAFE_MODES: &[&str] = &["/GCM/", "/CCM/", "/EAX/", "/OCB/", "/CWC/", "/GCM-SIV/"];

fn cipher(name: &str, found: &mut Vec<Hit>) {
    let integral = name.starts_with("RSA") || name == "ECIES" || SAFE_MODES.iter().any(|mode| name.contains(mode));
    if !integral {
        found.push(hit(INTEGRITY, "The cipher does not provide data integrity", 1));
    }
    let ecb = ["AES", "DES", "DESede"].iter().any(|block| name == *block || name.starts_with(&format!("{block}/ECB/")));
    if ecb {
        found.push(hit(ECB, "The cipher uses ECB mode, which provides poor confidentiality for encrypted data", 1));
    }
    if name.contains("/CBC/PKCS5Padding") {
        found.push(hit(ORACLE, "The cipher is susceptible to padding oracle attacks", 1));
    }
}

/// The findings of a call given an algorithm name.
pub fn hits(used: Use, name: &str) -> Vec<Hit> {
    let mut found = Vec::new();
    match used {
        Use::Digest => found.extend(digest(name)),
        Use::Signature => found.extend(name.find("with").and_then(|at| digest(&name[..at]))),
        Use::Cipher | Use::KeyGenerator => {
            if used == Use::Cipher {
                cipher(name, &mut found);
            }
            let upper = name.to_uppercase();
            if upper == "DES" || upper.starts_with("DES/") {
                found.push(hit(DES, "DES should be replaced with AES", 2));
            }
            if name.starts_with("RSA/") && name.ends_with("/NoPadding") {
                found.push(hit(RSA, "Use of RSA cipher without proper padding", 2));
            }
        }
    }
    found
}
