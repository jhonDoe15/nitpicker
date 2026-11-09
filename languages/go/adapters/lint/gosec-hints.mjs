const EXCEPTION =
  'If the input is trusted by design, add an exception for this rule with the reason.';
const STRONG_HASH =
  'Use crypto/sha256 or crypto/sha512 (golang.org/x/crypto/bcrypt or argon2 for passwords).';
const STRONG_CIPHER = 'Use crypto/aes with cipher.NewGCM, or golang.org/x/crypto/chacha20poly1305.';
const SERVER = '`http.Server{ReadHeaderTimeout: 5 * time.Second, ...}`';
const PRIVATE_FILE = 'Pass 0o600 or less (0o640 when a group must read it).';

export const GOSEC_MESSAGES = new Map([
  ['G303', 'File created at a fixed path in a shared temporary folder'],
  ['G407', 'Hardcoded IV or nonce passed to a cipher'],
  [
    'G504',
    'Blocklisted import net/http/cgi: CGI handlers are open to the Httpoxy attack (CVE-2016-5386)',
  ],
]);

export const GOSEC_HINTS = [
  ['G101', `Read the secret from the environment or a secret store. ${EXCEPTION}`],
  [
    'G102',
    'Bind to a specific interface, such as `127.0.0.1:8080`, or take the address from configuration.',
  ],
  [
    'G103',
    'Use the safe API (encoding/binary, slices, strings.Clone) instead of unsafe; where unsafe is needed, ' +
      'add an exception that says why.',
  ],
  [
    'G106',
    'Verify the host key with `ssh.FixedHostKey(key)` or golang.org/x/crypto/ssh/knownhosts.',
  ],
  [
    'G108',
    'Serve pprof on a separate, internal-only mux instead of importing net/http/pprof for its side effect.',
  ],
  ['G109', 'Parse with the target size, `strconv.ParseInt(text, 10, 32)`, then convert.'],
  ['G110', 'Copy at most a fixed number of bytes with `io.CopyN(target, reader, limit)`.'],
  ['G111', 'Serve a dedicated folder, such as `http.Dir("./static")`, or an embed.FS.'],
  ['G112', `Set ReadHeaderTimeout on the server: ${SERVER}.`],
  ['G113', 'Set Content-Length or Transfer-Encoding, never both.'],
  ['G114', `Build a server with timeouts and call its ListenAndServe: ${SERVER}.`],
  [
    'G115',
    'Check the value against the target range (math.MaxInt32 and friends) before converting.',
  ],
  [
    'G116',
    'Remove the bidirectional control characters; write them as escapes (`\\u202e`) if a string needs them.',
  ],
  ['G117', 'Tag the field `json:"-"`, or marshal a separate type without the secret.'],
  [
    'G118',
    'Call the cancel function (`defer cancel()`), and derive goroutine contexts from the caller context.',
  ],
  [
    'G119',
    'Leave CheckRedirect unset, or copy only headers that are safe for the redirect target origin.',
  ],
  [
    'G120',
    'Stream the parts with `request.MultipartReader()` and cap each one with `io.LimitReader`.',
  ],
  ['G121', 'Bypass only the exact paths that need it, such as a webhook endpoint.'],
  ['G122', 'Open the folder with `os.OpenRoot` and walk and change files through the root.'],
  ['G123', 'Move the check to VerifyConnection, which also runs for resumed sessions.'],
  [
    'G124',
    'Set `Secure: true`, `HttpOnly: true` and `SameSite: http.SameSiteStrictMode` (or Lax).',
  ],
  ['G125', 'Escape each segment with `url.PathEscape` before joining it.'],
  ['G201', 'Pass values as query parameters: `db.QueryContext(ctx, "... WHERE name = $1", name)`.'],
  ['G202', 'Pass values as query parameters: `db.QueryContext(ctx, "... WHERE name = $1", name)`.'],
  [
    'G203',
    `Let html/template escape the value, or sanitise it before converting to template.HTML. ${EXCEPTION}`,
  ],
  ['G301', 'Pass 0o750 or less.'],
  ['G302', PRIVATE_FILE],
  [
    'G303',
    'Create the file with `os.CreateTemp("", "name-*")`, or in a folder from `os.MkdirTemp`.',
  ],
  [
    'G305',
    'Reject entries whose cleaned path leaves the target folder, or extract through an `os.Root`.',
  ],
  ['G306', PRIVATE_FILE],
  [
    'G307',
    'Open the file with explicit permissions: `os.OpenFile(path, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0o600)`.',
  ],
  ['G401', STRONG_HASH],
  ['G402', 'Keep certificate verification on and set `MinVersion: tls.VersionTLS12` or later.'],
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
  ['G504', 'Serve the application over net/http directly.'],
  ['G505', STRONG_HASH],
  ['G506', STRONG_HASH],
  ['G507', STRONG_HASH],
  [
    'G601',
    'Take the address of the element, `&values[index]`, or copy the variable inside the loop.',
  ],
  ['G602', 'Check the length before slicing, or bound the index with `min(n, len(values))`.'],
  ['G701', 'Pass request values as query parameters, never as part of the SQL text.'],
  [
    'G702',
    'Choose the command from a fixed list, and pass request values only as separate arguments.',
  ],
  ['G703', 'Open request paths through an `os.Root` for the allowed folder.'],
  ['G704', 'Build the URL from a fixed host and escape request values into the path or query.'],
  ['G705', 'Render HTML with html/template, or escape the value with `html.EscapeString`.'],
  ['G706', 'Log request values as structured fields, `slog.Info("msg", "user", value)`.'],
  ['G707', 'Parse addresses with `mail.ParseAddress` and reject CR or LF in header values.'],
  ['G708', 'Parse only templates from the program, and pass request values as data.'],
  ['G709', 'Decode request data with encoding/json into a fixed type.'],
  ['G710', 'Redirect only to relative paths or to hosts from a fixed list.'],
];
