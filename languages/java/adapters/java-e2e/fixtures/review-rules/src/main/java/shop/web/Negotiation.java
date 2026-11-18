package shop.web;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.RequestHeader;

public final class Negotiation {
  private static final Set<String> TEXT_TYPES = Set.of("text/plain", "text/html");
  private static final Map<String, String> MIME_TYPES = Map.of(".png", "image/png", ".jpg", "image/jpeg");

  private static final String JSON = "application/json";

  private Negotiation() {}

  public static boolean isJson(HttpServletRequest request) {
    return "application/json".equals(request.getHeader("Content-Type")); // violation: HttpValueCase
  }

  public static boolean isForm(HttpServletRequest request) {
    String type = request.getContentType();
    return type != null && type.startsWith("application/x-www-form-urlencoded"); // violation: HttpValueCase
  }

  public static boolean isSecure(HttpServletRequest request) {
    return request.getHeader("X-Forwarded-Proto").equals("https"); // violation: HttpValueCase
  }

  public static boolean isText(HttpHeaders headers) {
    String type = headers.getFirst(HttpHeaders.CONTENT_TYPE);
    return TEXT_TYPES.contains(type); // violation: HttpValueCase
  }

  public static boolean isHttps(URI uri) {
    return "https".equals(uri.getScheme()); // violation: HttpValueCase
  }

  public static String kind(HttpServletRequest request) {
    switch (request.getHeader("Accept")) { // violation: HttpValueCase
      case "text/html":
        return "page";
      default:
        return "data";
    }
  }

  public static boolean isHostCookie(String name) {
    return name.startsWith("__Host-"); // violation: HttpValueCase
  }

  public static String mime(String file) {
    String extension = file.substring(file.lastIndexOf("."));
    return MIME_TYPES.get(extension); // violation: HttpValueCase
  }

  public static boolean isXml(@RequestHeader("Accept") String accept) {
    return accept.contains("application/xml"); // violation: HttpValueCase
  }

  public static boolean isJsonObjects(HttpServletRequest request) {
    return Objects.equals(request.getHeader("Content-Type"), "application/json"); // violation: HttpValueCase
  }

  public static boolean isJsonTrimmed(HttpServletRequest request) {
    return request.getHeader("Content-Type").trim().equals("application/json"); // violation: HttpValueCase
  }

  public static boolean mentionsJson(HttpServletRequest request) {
    return request.getHeader("Accept").indexOf("json") >= 0; // violation: HttpValueCase
  }

  public static boolean isJsonConstant(HttpServletRequest request) {
    return request.getHeader("Content-Type").equals(JSON); // violation: HttpValueCase
  }

  public static String[] acceptedPattern(HttpServletRequest request) {
    return Pattern.compile(",").split(request.getHeader("Accept")); // violation: HandSplitHttpHeader
  }

  public static boolean isJsonLowered(HttpServletRequest request) {
    String type = request.getHeader("Content-Type");
    return type != null && type.toLowerCase(Locale.ROOT).equals("application/json");
  }

  public static boolean isJsonIgnoringCase(HttpServletRequest request) {
    return "application/json".equalsIgnoreCase(request.getHeader("Content-Type"));
  }

  public static boolean isJsonParsed(HttpHeaders headers) {
    MediaType type = headers.getContentType();
    return type != null && MediaType.APPLICATION_JSON.equals(type);
  }

  public static boolean isSecureIgnoringCase(URI uri) {
    return "https".equalsIgnoreCase(uri.getScheme());
  }

  public static boolean isLoweredCookie(String name) {
    return name.toLowerCase(Locale.ROOT).startsWith("__host-");
  }

  public static String mimeLowered(String file) {
    String extension = file.substring(file.lastIndexOf(".")).toLowerCase(Locale.ROOT);
    return MIME_TYPES.get(extension);
  }

  public static boolean isRequestedWith(HttpServletRequest request) {
    return "XMLHttpRequest".equals(request.getHeader("X-Requested-With"));
  }

  public static boolean isLength(HttpServletRequest request) {
    return "0".equals(request.getHeader("Content-Length"));
  }

  public static boolean isPost(HttpServletRequest request) {
    return "POST".equals(request.getMethod());
  }

  public static String[] accepted(HttpServletRequest request) {
    return request.getHeader("Accept").split(","); // violation: HandSplitHttpHeader
  }

  public static String charset(HttpHeaders headers) {
    String type = headers.getFirst(HttpHeaders.CONTENT_TYPE);
    return type.split(";")[1]; // violation: HandSplitHttpHeader
  }

  public static String mediaType(HttpServletRequest request) {
    return request.getHeader("Content-Type").split(";")[0].trim().toLowerCase();
  }

  public static String heldMediaType(HttpServletRequest request) {
    String type = request.getHeader("Content-Type");
    return type.split(";")[0];
  }

  public static String firstCookie(HttpServletRequest request) {
    return request.getHeader("Cookie").split(";")[0]; // violation: HandSplitHttpHeader
  }

  public static String[] cookies(HttpServletRequest request) {
    return request.getHeader("Cookie").split("; "); // violation: HandSplitHttpHeader
  }

  public static String[] forwarded(HttpServletRequest request) {
    return request.getHeader("X-Forwarded-For").split(",");
  }

  public static MediaType parsed(HttpServletRequest request) {
    return MediaType.parseMediaType(request.getHeader("Content-Type"));
  }
}
