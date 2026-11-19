package shop.nullable;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Objects;

public final class RequestInfo {
  public String versionPrefix(Package owner) {
    String version = owner.getImplementationVersion();
    return version.substring(0, 1); // violation: NullableLibraryResult
  }

  public String safeVersion(Package owner) {
    String version = owner.getImplementationVersion();
    return version == null ? null : version.substring(0, 1);
  }

  public ClassLoader ownLoader() {
    return RequestInfo.class.getClassLoader().getParent();
  }

  public boolean sameLoader(Class<?> type) {
    ClassLoader context = Thread.currentThread().getContextClassLoader();
    return type.getClassLoader().equals(context);
  }

  public boolean debugRequested(HttpServletRequest request) {
    return request.getQueryString().contains("debug"); // violation: NullableLibraryResult
  }

  public int agentLength(HttpServletRequest request) {
    String agent = request.getHeader("User-Agent");
    return agent.length(); // violation: NullableLibraryResult
  }

  public Object login(HttpServletRequest request) {
    return request.getSession(false).getAttribute("userLogin"); // violation: NullableLibraryResult
  }

  public boolean debugGuarded(HttpServletRequest request) {
    return request.getQueryString() != null && request.getQueryString().contains("debug");
  }

  public int agentLengthGuarded(HttpServletRequest request) {
    String agent = request.getHeader("User-Agent");
    if (agent == null) {
      return 0;
    }
    return agent.length();
  }

  public String pageParameter(HttpServletRequest request) {
    return Objects.requireNonNullElse(request.getParameter("page"), "1").trim();
  }

  public Object sessionOrNull(HttpServletRequest request) {
    var session = request.getSession(false);
    return session == null ? null : session.getAttribute("userLogin");
  }

  public boolean agentPresent(HttpServletRequest request) {
    boolean present = request.getHeader("User-Agent") != null;
    return present && request.getHeader("User-Agent").length() > 0;
  }

  public int agentChecked(HttpServletRequest request) {
    if (isBlank(request.getHeader("User-Agent"))) {
      return 0;
    }
    return request.getHeader("User-Agent").length();
  }

  public int agentOtherHeader(HttpServletRequest request) {
    if (isBlank(request.getHeader("Accept"))) {
      return 0;
    }
    return request.getHeader("User-Agent").length(); // violation: NullableLibraryResult
  }

  public void invalidate(HttpServletRequest request) {
    try {
      request.getSession(false).invalidate();
    } catch (NullPointerException ex) {
      return;
    }
  }

  public Object newSession(HttpServletRequest request) {
    return request.getSession(true).getAttribute("userLogin");
  }

  private static boolean isBlank(String value) {
    return value == null || value.isBlank();
  }
}
