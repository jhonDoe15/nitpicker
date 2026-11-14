package shop.outbound;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestOperations;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.context.request.WebRequest;

@Component
public class RequestSources {
  private static final String BASE = "https://rates.example.com";

  private final RestOperations template;

  public RequestSources(RestOperations template) {
    this.template = template;
  }

  public record Form(String next, int page, Object origin) {}

  public static class Settings {
    public Object getEndpoint() {
      return BASE;
    }

    public int getRetries() {
      return 3;
    }
  }

  public Object form(Form form) {
    Object a = template.getForObject(form.next(), String.class); // violation: SpringOutboundUrl
    Object b = template.getForObject(form.origin().toString(), String.class); // violation: SpringOutboundUrl
    Object c = template.getForObject(BASE + "/page/" + form.page(), String.class);
    return a;
  }

  public Object settings(Settings settings) {
    Object a = template.getForObject(settings.getEndpoint().toString(), String.class); // violation: SpringOutboundUrl
    Object b = template.getForObject(BASE + "/retries/" + settings.getRetries(), String.class);
    return a;
  }

  public Object servlet(HttpServletRequest request) {
    Object a = template.getForObject(request.getParameter("u"), String.class); // violation: SpringOutboundUrl
    String target = request.getHeader("X-Target");
    Object b = template.getForObject(target, String.class); // violation: SpringOutboundUrl
    Object c = template.getForObject(BASE + request.getQueryString(), String.class); // violation: SpringOutboundUrl
    Object d = template.getForObject(request.getParameterValues("u")[0], String.class); // violation: SpringOutboundUrl
    Object e = template.getForObject(request.getHeaders("X").nextElement(), Map.class); // violation: SpringOutboundUrl
    Object f = template.getForObject(BASE + "/rates/{id}", String.class, request.getParameter("id"));
    return a;
  }

  public Object legacy(javax.servlet.ServletRequest request) {
    return template.getForObject(request.getParameter("u"), String.class); // violation: SpringOutboundUrl
  }

  public Object web(WebRequest request, NativeWebRequest nativeRequest) {
    Object a = template.getForObject(request.getHeader("X-Target"), String.class); // violation: SpringOutboundUrl
    Object b = template.getForObject(nativeRequest.getParameter("u"), String.class); // violation: SpringOutboundUrl
    Object c = template.getForObject(BASE + "/rates/{id}", String.class, request.getParameter("id"));
    return a;
  }

  public Object maps(Map<String, String> params, MultiValueMap<String, String> multi) {
    Object a = template.getForObject(params.get("u"), String.class); // violation: SpringOutboundUrl
    Object b = template.getForObject(multi.getFirst("u"), String.class); // violation: SpringOutboundUrl
    Object c = template.getForObject(params.getOrDefault("u", BASE), String.class); // violation: SpringOutboundUrl
    Object d = template.getForObject(BASE + "/rates/{id}", String.class, params.get("id"));
    return a;
  }
}
