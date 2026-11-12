const EXCEPTION =
  'If the value is trusted by design, add an exception for this rule with the reason.';
const UNSANITISED =
  'The rule accepts no validation, so a value the code already checks takes an exception with the reason.';
const STRONG_HASH =
  'Use crypto/sha256 or crypto/sha512 (golang.org/x/crypto/bcrypt or argon2 for passwords). ' +
  'A checksum that protects nothing, or a protocol that requires the algorithm, takes an exception with the reason.';
const STRONG_CIPHER = 'Use crypto/aes with cipher.NewGCM, or golang.org/x/crypto/chacha20poly1305.';
const SERVER = '`http.Server{ReadHeaderTimeout: 5 * time.Second, ...}`';
const PRIVATE_FILE =
  'Pass 0o600 or a mode with fewer bits, such as 0o400. ' +
  'A file other users must read takes an exception with the reason.';
const PLACEHOLDERS =
  'Pass values as query parameters (`?` or `$1`, as the driver expects). ' +
  'An identifier such as a table name cannot be a parameter: pick it from a fixed list and add an exception.';

const GOSEC_MESSAGES = new Map([
  ['G303', 'File created at a fixed path in a shared temporary folder'],
  ['G407', 'Hardcoded IV or nonce passed to a cipher'],
]);

export function gosecMessage(rule, message) {
  return GOSEC_MESSAGES.get(rule) ?? message;
}

export const GOSEC_HINTS = [
  [
    'G102',
    'Bind to a specific interface, such as `127.0.0.1:8080`, or take the address from configuration.',
  ],
  [
    'G103',
    'Use a safe form instead of unsafe: `string(data)`, encoding/binary, or the slices package. ' +
      'Where unsafe is needed, add an exception that says why.',
  ],
  [
    'G106',
    'Verify the host key with `ssh.FixedHostKey(key)` or golang.org/x/crypto/ssh/knownhosts.',
  ],
  [
    'G108',
    'Import net/http/pprof by name and register its handlers on an internal-only mux: ' +
      '`mux.HandleFunc("/debug/pprof/", pprof.Index)`.',
  ],
  ['G109', 'Parse with the target size, `strconv.ParseInt(text, 10, 32)`, then convert.'],
  ['G110', 'Copy through a limit: `io.Copy(target, io.LimitReader(reader, limit))`.'],
  ['G111', 'Serve a dedicated folder, such as `http.Dir("./static")`, or an embed.FS.'],
  ['G112', `Set ReadHeaderTimeout on the server: ${SERVER}.`],
  ['G113', 'Set Content-Length or Transfer-Encoding, never both.'],
  ['G114', `Build a server with timeouts and call its ListenAndServe: ${SERVER}.`],
  [
    'G115',
    'Check the value against the target range (math.MaxInt32 and friends) before converting.',
  ],
  [
    'G117',
    'Tag the field `json:"-"`, or marshal a separate type without the secret. ' +
      'A request body that must carry the secret takes an exception with the reason.',
  ],
  ['G118', 'Derive goroutine contexts from the caller context, and call every cancel function.'],
  [
    'G119',
    'Leave CheckRedirect unset, or copy only headers that are safe for the redirect target origin.',
  ],
  [
    'G120',
    `Stream the parts with \`request.MultipartReader()\` and cap each one with \`io.LimitReader\`. ${UNSANITISED}`,
  ],
  ['G121', 'Bypass only the exact paths that need it, such as a webhook endpoint.'],
  ['G122', 'Open the folder with `os.OpenRoot` and walk and change files through the root.'],
  ['G123', 'Move the check to VerifyConnection, which also runs for resumed sessions.'],
  [
    'G124',
    'Set `Secure: true`, `HttpOnly: true` and `SameSite: http.SameSiteStrictMode` (or Lax). ' +
      'A cookie scripts must read, such as a CSRF token, takes an exception with the reason.',
  ],
  [
    'G125',
    'Escape each segment with `url.PathEscape` and reject `.` and `..` segments before joining.',
  ],
  ['G201', PLACEHOLDERS],
  ['G202', PLACEHOLDERS],
  [
    'G203',
    'Return a plain string and let html/template escape it. ' +
      'Converting to template.HTML (or CSS, JS, URL) needs an exception that says where the markup comes from.',
  ],
  ['G301', 'Pass 0o750 or a mode with fewer bits, such as 0o700.'],
  ['G302', PRIVATE_FILE],
  [
    'G303',
    'Create the file with `os.CreateTemp("", "name-*")`, or in a folder from `os.MkdirTemp`.',
  ],
  [
    'G305',
    'Extract through an `os.Root` for the target folder (`root.MkdirAll(file.Name, 0o750)`, `root.Create`), ' +
      'which keeps every entry inside it.',
  ],
  ['G306', PRIVATE_FILE],
  [
    'G307',
    'Open the file with explicit permissions: ' +
      `\`os.OpenFile(path, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0o600)\`. ${PRIVATE_FILE}`,
  ],
  ['G401', STRONG_HASH],
  [
    'G402',
    'Keep certificate verification on and set `MinVersion: tls.VersionTLS12` or later; ' +
      'a test server uses its own certificate (`httptest.NewTLSServer` and `server.Client()`).',
  ],
  ['G403', 'Generate RSA keys of at least 2048 bits (3072 recommended).'],
  [
    'G404',
    'Use crypto/rand (`rand.Text()`, `rand.Read`) for anything an attacker must not guess. ' +
      'For simulations, jitter or sampling, add an exception for this rule with the reason.',
  ],
  ['G405', STRONG_CIPHER],
  ['G406', STRONG_HASH],
  ['G407', 'Generate a fresh nonce per message with crypto/rand and send it with the ciphertext.'],
  ['G408', 'Do not keep state from PublicKeyCallback; return the key in `Permissions.Extensions`.'],
  ['G501', STRONG_HASH],
  ['G502', STRONG_CIPHER],
  ['G503', STRONG_CIPHER],
  ['G505', STRONG_HASH],
  ['G506', STRONG_HASH],
  ['G507', STRONG_HASH],
  [
    'G601',
    'Take the address of the element, `&values[index]`, or raise the `go` line in go.mod to 1.22 or later.',
  ],
  ['G602', 'Check the length before slicing, or bound the index with `min(n, len(values))`.'],
  ['G701', 'Pass request values as query parameters, never as part of the SQL text.'],
  [
    'G702',
    `Look the command up in a fixed map, \`commands[key]\`, instead of running a name from the input. ${UNSANITISED}`,
  ],
  ['G703', `Open request paths through an \`os.Root\` for the allowed folder. ${UNSANITISED}`],
  [
    'G704',
    'Build the URL with `url.URL{Scheme: "https", Host: fixedHost, Path: ...}` and pass `String()` ' +
      'to `http.NewRequestWithContext`. ' +
      UNSANITISED,
  ],
  ['G705', 'Render HTML with html/template, or escape the value with `html.EscapeString`.'],
  [
    'G706',
    'Log request values as structured attributes: ' +
      '`slog.InfoContext(ctx, "msg", slog.String("user", value))`.',
  ],
  [
    'G707',
    'Parse sender and recipient addresses with `mail.ParseAddress` and pass `address.Address`.',
  ],
  ['G708', 'Parse only templates from the program, and pass request values as data.'],
  ['G709', 'Decode request data with encoding/json into a fixed type.'],
  ['G710', `Redirect to a path or host picked from a fixed map. ${UNSANITISED}`],
];
