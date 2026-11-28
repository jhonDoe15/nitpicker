package fixed;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public class Registry {
  private final List<Route> routes;
  private final Map<String, Route> byName = new HashMap<>();
  private final List<Route> growing = new ArrayList<>();

  public Registry(List<Route> routes) {
    this.routes = List.copyOf(routes);
    for (Route route : routes) {
      byName.put(route.name(), route);
    }
  }

  public Optional<Route> find(String path) {
    return routes.stream().filter(route -> route.path().equals(path)).findFirst();
  }

  public Route named(String name) {
    for (Route route : byName.values()) {
      if (name.equals(route.name())) {
        return route;
      }
    }
    return null;
  }

  public boolean known(String path) {
    return growing.stream().anyMatch(route -> route.path().equals(path));
  }

  public void register(Route route) {
    growing.add(route);
  }

  public Optional<Route> once(String path) {
    return routes.stream().filter(route -> route.path().equals(path)).findAny();
  }

  public boolean byConstant() {
    return routes.stream().anyMatch(route -> route.path().equals("/"));
  }

  public List<Route> resolveAll(List<String> paths, List<String> names) {
    List<Route> found = new ArrayList<>();
    for (String path : paths) {
      find(path).ifPresent(found::add);
      if (known(path)) {
        found.add(null);
      }
    }
    names.forEach(name -> found.add(named(name)));
    return found;
  }

  public void single(String path) {
    once(path);
  }

  public record Route(String name, String path) {}
}
