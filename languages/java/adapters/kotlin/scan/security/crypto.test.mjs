import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { disabledTlsVerification, WEAK_HMAC_MESSAGE, weakHashes } from './crypto.mjs';

function found(check, lines) {
  const source = `class Crypto {\n${lines.map((line) => `    ${line}`).join('\n')}\n}\n`;
  const scanned = scanKotlinSource(source);
  return check(scanned).map((reported) => lineOf(scanned, reported.offset));
}

describe('weakHashes', () => {
  it.each([
    ['MD5 by name', 'val digest = MessageDigest.getInstance("MD5")'],
    [
      'SHA-1 by name',
      'fun sum(bytes: ByteArray) = MessageDigest.getInstance("SHA-1").digest(bytes)',
    ],
    ['SHA by its JCA alias', 'val digest = MessageDigest.getInstance("SHA")'],
    ['a codec constant', 'val digest = MessageDigest.getInstance(MessageDigestAlgorithms.MD5)'],
    ['a signature over MD5', 'val signer = Signature.getInstance("MD5withRSA")'],
    ['commons-codec helpers', 'fun etag(body: String) = DigestUtils.md5Hex(body)'],
    ['a commons-codec digest object', 'val utils = DigestUtils(MessageDigestAlgorithms.SHA_1)'],
    ['Spring helpers', 'fun etag(body: ByteArray) = DigestUtils.md5DigestAsHex(body)'],
    ['Guava', 'val hasher = Hashing.sha1().newHasher()'],
    ['Okio', 'fun sum(text: String) = text.encodeUtf8().md5().hex()'],
  ])('flags %s', (_name, line) => {
    expect(found(weakHashes, [line])).toEqual([2]);
  });

  it('resolves an algorithm constant in the file', () => {
    expect(
      found(weakHashes, [
        'private val digest = MessageDigest.getInstance(ALGORITHM)',
        'companion object { private const val ALGORITHM = "MD5" }',
      ]),
    ).toEqual([2]);
  });

  it('words HMAC-MD5 as a signing problem and accepts HMAC-SHA1', () => {
    const scanned = scanKotlinSource(
      'val mac = Mac.getInstance("HmacMD5")\nval totp = Mac.getInstance("HmacSHA1")\nval key = HmacUtils.hmacMd5Hex(k, v)\n',
    );

    expect(weakHashes(scanned).map(({ message }) => message)).toEqual([
      WEAK_HMAC_MESSAGE,
      WEAK_HMAC_MESSAGE,
    ]);
  });

  it.each([
    ['SHA-256', 'val digest = MessageDigest.getInstance("SHA-256")'],
    ['SHA3', 'val digest = MessageDigest.getInstance("SHA3-256")'],
    ['HMAC-SHA256', 'val mac = Mac.getInstance("HmacSHA256")'],
    [
      'a configured algorithm',
      'fun digest(algorithm: String) = MessageDigest.getInstance(algorithm)',
    ],
    ['a strong helper', 'fun sum(body: String) = DigestUtils.sha256Hex(body)'],
    ['a signature over SHA-256', 'val signer = Signature.getInstance("SHA256withRSA")'],
    ['a name in a comment', '// MessageDigest.getInstance("MD5") was replaced'],
    ['a project function', 'fun md5Of(text: String) = sha256(text)'],
  ])('passes %s', (_name, line) => {
    expect(found(weakHashes, [line])).toEqual([]);
  });
});

describe('disabledTlsVerification', () => {
  it.each([
    [
      'a trust-all trust manager',
      [
        'val trustAll = object : X509TrustManager {',
        '    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}',
        '    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}',
        '    override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()',
        '}',
      ],
      4,
    ],
    [
      'an OkHttp host-name verifier',
      ['val client = builder.hostnameVerifier { _, _ -> true }.build()'],
      2,
    ],
    [
      'a default host-name verifier',
      ['HttpsURLConnection.setDefaultHostnameVerifier { _, _ -> true }'],
      2,
    ],
    [
      'a verifier object',
      [
        'val any = object : HostnameVerifier {',
        '    override fun verify(hostname: String?, session: SSLSession?) = true',
        '}',
      ],
      3,
    ],
    [
      'the Apache no-op verifier',
      ['val factory = SSLConnectionSocketFactory(context, NoopHostnameVerifier.INSTANCE)'],
      2,
    ],
    [
      'a trust-all strategy',
      ['val context = SSLContextBuilder().loadTrustMaterial(null, TrustAllStrategy()).build()'],
      2,
    ],
    [
      'a trust lambda',
      ['val context = SSLContexts.custom().loadTrustMaterial(null) { _, _ -> true }.build()'],
      2,
    ],
    [
      'the Netty insecure factory',
      [
        'val ssl = SslContextBuilder.forClient().trustManager(InsecureTrustManagerFactory.INSTANCE)',
      ],
      2,
    ],
    ['a switch by environment', ['if (insecure) builder.hostnameVerifier { _, _ -> true }'], 2],
  ])('flags %s', (_name, lines, line) => {
    expect(found(disabledTlsVerification, lines)).toEqual([line]);
  });

  it.each([
    [
      'a delegating trust manager',
      [
        'val pinned = object : X509TrustManager {',
        '    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}',
        '    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {',
        '        delegate.checkServerTrusted(chain, authType)',
        '    }',
        '    override fun getAcceptedIssuers(): Array<X509Certificate> = delegate.acceptedIssuers',
        '}',
      ],
    ],
    [
      'a verifier that checks the host',
      ['val verifier = HostnameVerifier { host, _ -> host == expectedHost }'],
    ],
    [
      'a private CA',
      [
        'val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(keyStore) }',
      ],
    ],
    [
      'OkHttp handshake certificates',
      ['val certificates = HandshakeCertificates.Builder().addTrustedCertificate(ca).build()'],
    ],
  ])('passes %s', (_name, lines) => {
    expect(found(disabledTlsVerification, lines)).toEqual([]);
  });
});
