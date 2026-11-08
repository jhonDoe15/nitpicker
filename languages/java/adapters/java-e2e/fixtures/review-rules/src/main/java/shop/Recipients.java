package shop;

import java.util.List;
import java.util.Set;
import org.springframework.lang.Nullable;

public final class Recipients {
  private Recipients() {}

  public static String send(
      @Nullable String recipient,
      @Nullable List<String> recipients) { // violation: SingularAndPluralMember
    return recipients == null ? String.valueOf(recipient) : String.join(",", recipients);
  }

  public static boolean contains(String role, Set<String> roles) {
    return roles.contains(role);
  }

  public static String label(@Nullable String tag, @Nullable List<Integer> tags) {
    return tag + tags;
  }

  static String hidden(@Nullable String tag, @Nullable List<String> tags) {
    return tag + tags;
  }

  public static final class Request {
    private String child;
    private List<String> children; // violation: SingularAndPluralMember

    public String getChild() {
      return child;
    }

    public void setChild(String child) {
      this.child = child;
    }

    public List<String> getChildren() {
      return children;
    }

    public void setChildren(List<String> children) {
      this.children = List.copyOf(children);
    }
  }

  public static final class Router {
    private final String route;
    private final List<String> routes;

    public Router(String route, List<String> routes) {
      this.route = route;
      this.routes = List.copyOf(routes);
    }

    public String resolve(String path) {
      return routes.contains(path) ? path : route;
    }
  }
}
