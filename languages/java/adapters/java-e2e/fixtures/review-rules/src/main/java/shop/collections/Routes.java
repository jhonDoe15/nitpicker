package shop.collections;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.stream.Collectors;

public final class Routes {
  public record Route(String path, int weight) {}

  private final List<Route> routes;

  public Routes(List<Route> routes) {
    this.routes = List.copyOf(routes);
  }

  public List<String> uniquePaths(List<Route> incoming) {
    List<String> seen = new ArrayList<>();
    for (Route route : incoming) {
      if (!seen.contains(route.path())) { // violation: ListUsedAsSet
        seen.add(route.path());
      }
    }
    return seen;
  }

  public Set<String> uniquePathsInSet(List<Route> incoming) {
    Set<String> seen = new HashSet<>();
    for (Route route : incoming) {
      seen.add(route.path());
    }
    return seen;
  }

  public List<String> orderedPaths(List<Route> incoming) {
    List<String> ordered = new ArrayList<>();
    for (Route route : incoming) {
      if (!ordered.contains(route.path())) {
        ordered.add(0, route.path());
      }
    }
    return ordered;
  }

  public List<String> streamedUnique(List<Route> incoming) {
    List<String> seen = new ArrayList<>();
    incoming.forEach(
        route -> {
          if (!seen.contains(route.path())) { // violation: ListUsedAsSet
            seen.add(route.path());
          }
        });
    return seen;
  }

  public boolean lazyCheck(String path) {
    List<String> once = new ArrayList<>();
    once.add(path);
    Supplier<Boolean> check = () -> once.contains(path);
    return check.get();
  }

  public boolean addOnce(String path) {
    List<String> single = new ArrayList<>();
    single.add(path);
    return single.contains(path);
  }

  public List<Optional<Route>> matching(List<String> paths) {
    return paths.stream()
        .map(p -> routes.stream().filter(r -> r.path().equals(p)).findFirst()) // violation: LinearLookupInLoop
        .toList();
  }

  public int known(List<String> paths) {
    int count = 0;
    for (String path : paths) {
      if (routes.stream().anyMatch(r -> Objects.equals(path, r.path()))) { // violation: LinearLookupInLoop
        count++;
      }
    }
    return count;
  }

  public List<Optional<Route>> indexed(List<String> paths) {
    Map<String, Route> byPath =
        routes.stream().collect(Collectors.toMap(Route::path, Function.identity()));
    return paths.stream().map(path -> Optional.ofNullable(byPath.get(path))).toList();
  }

  public long perGroup(List<List<Route>> groups, String path) {
    return groups.stream()
        .filter(group -> group.stream().anyMatch(route -> route.path().equals(path)))
        .count();
  }

  public Optional<Route> root() {
    return routes.stream().filter(route -> route.path().equals("/")).findFirst();
  }

  public long fixed(List<String> paths) {
    return paths.stream().filter(p -> routes.stream().anyMatch(r -> r.path().equals("/"))).count();
  }

  public List<Route> rebuilt(List<String> paths) {
    List<Route> added = new ArrayList<>();
    for (String path : paths) {
      if (added.stream().noneMatch(route -> route.path().equals(path))) {
        added.add(new Route(path, 1));
      }
    }
    return added;
  }

  public Optional<Route> heaviest(List<Route> candidates) {
    Comparator<Route> byWeight = Comparator.comparingInt(Route::weight);
    return candidates.stream().sorted(byWeight.reversed()).findFirst(); // violation: SortForExtreme
  }

  public Route lightest(List<Route> candidates) {
    Comparator<Route> byWeight = Comparator.comparingInt(Route::weight);
    return candidates.stream().sorted(byWeight).toList().get(0); // violation: SortForExtreme
  }

  public Optional<Route> heaviestInOnePass(List<Route> candidates) {
    return candidates.stream().max(Comparator.comparingInt(Route::weight));
  }

  public List<Route> topThree(List<Route> candidates) {
    return candidates.stream().sorted(Comparator.comparingInt(Route::weight)).limit(3).toList();
  }
}
