package shop.outbound;

import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.web.client.RestOperations;

@Controller
public class AllowLists {
  private static final String BASE = "https://rates.example.com";
  private static final Map<String, String> ROUTES = Map.of("eu", "/eu", "us", "/us");

  private final RestOperations template;

  public AllowLists(RestOperations template) {
    this.template = template;
  }

  public Object outbound(String url, CharSequence text, boolean ok, String code) {
    String fixed = ok ? "/a" : "/b";
    String viaUrl = url.isEmpty() ? "/a" : "/b";
    String chosen = ok ? url : BASE;
    Object a = template.getForObject(BASE + fixed + viaUrl, String.class);
    Object b = template.getForObject(chosen, String.class); // violation: SpringOutboundUrl
    String viaSwitch = switch (code) {
      case "eu" -> "/eu";
      default -> "/us";
    };
    String carried = switch (code) {
      case "eu" -> url;
      default -> BASE;
    };
    Object c = template.getForObject(BASE + viaSwitch, String.class);
    Object d = template.getForObject(carried, String.class); // violation: SpringOutboundUrl
    String known = "" + (url != null && url.length() > 3);
    String denied = "" + !url.isEmpty();
    String kind = "" + (text instanceof String);
    Object e = template.getForObject(BASE + known + denied + kind, String.class);
    Object f = template.getForObject(BASE + ROUTES.getOrDefault(code, "/eu"), String.class);
    Object g = template.getForObject(BASE + ROUTES.get(code), String.class);
    Object h = template.getForObject(BASE + ROUTES.containsKey(url), String.class);
    Object i = template.getForObject(ROUTES.getOrDefault(code, url), String.class); // violation: SpringOutboundUrl
    return a;
  }

  public String redirects(String next, String key, boolean ok) {
    String viaMap = "redirect:" + ROUTES.getOrDefault(key, "/home");
    String viaFallback = "redirect:" + ROUTES.getOrDefault(key, next); // violation: SpringOpenRedirect
    String viaConditional = "redirect:" + (ok ? "/a" : "/b");
    String viaNext = "redirect:" + (ok ? next : "/"); // violation: SpringOpenRedirect
    String viaSwitch = "redirect:" + switch (key) {
      case "eu" -> "/eu";
      default -> "/home";
    };
    String carried = "redirect:" + switch (key) { // violation: SpringOpenRedirect
      case "eu" -> next;
      default -> "/home";
    };
    String shown = "" + (next != null && !next.isEmpty());
    return "redirect:" + shown;
  }
}
