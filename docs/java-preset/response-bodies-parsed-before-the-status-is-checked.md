# Response bodies parsed before the status is checked

A response body that is passed to a JSON parser before the status of the response is read is an enforceable
`pmd/UncheckedResponseBody` finding (`languages/java/adapters/review-rules/value-checks/response-body/`), in the Java
and Kotlin presets alike. An error status from a proxy, a gateway or a CDN usually carries an HTML or empty body, so the
parser throws an opaque error and the real status is lost, or the success path runs on an error body. The rule is read
from the main sources of every module and printed as a PMD rule. The finding is on the line of the first read of the body.

- **The response:** a local assigned from a JDK `HttpClient` call (`send` or `sendAsync` with a `BodyHandlers` argument) or
  from an OkHttp call (`newCall(...).execute()`).
- **The read:** `response.body()` (OkHttp `response.body().string()`) given directly to a call named `readValue`,
  `readTree`, `fromJson`, `parseString`, `parseReader`, `decodeFromString`, `JSONObject`, `JSONArray`, `JsonParser` or
  `JsonPath`, or copied to a local that is then given to one of them.
- **Allowed forms, not reported:** any earlier use of the response other than `.body` (`statusCode()`, `isSuccessful()`,
  `code`, `headers()`, a helper that is handed the response), and a body that is not parsed as JSON.
- **Not covered:** clients that throw on a non-2xx status themselves (Spring `RestTemplate`, `RestClient`, `WebClient`
  `retrieve()`), Apache HttpClient, a body read in another method, and generic calls such as `decodeFromString<T>(...)`.

The message names the response and the allowed form, and ends with the exception route
`pmd/UncheckedResponseBody`.
