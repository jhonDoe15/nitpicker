package route;

import java.util.List;
import java.util.Map;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Supplier;

public class Router {
  private static final Map<String, Consumer<String>> TABLE =
      Map.of("a", Handlers::onA, "b", text -> Handlers.onB(text));
  private static final List<String> NAMES = List.of("a", "b");

  private final String prefix;

  public Router(String prefix) {
    this.prefix = prefix;
  }

  public void route(String key) {
    TABLE.get(key).accept(prefix + key);
  }

  public Consumer<String> callback() {
    return Handlers::onA;
  }

  public Consumer<String> bound(Handlers handlers) {
    return handlers::instance;
  }

  public Function<String, Router> factory() {
    return Router::new;
  }

  public Supplier<String> own() {
    return this::describe;
  }

  public Object leftOut() {
    Consumer<Integer> overloaded = Handlers::over;
    Function<Object, String> external = String::valueOf;
    return List.of(overloaded, external, NAMES);
  }

  public String describe() {
    return prefix;
  }

  public Object picks() {
    Consumer<String> one = Handlers::pick;
    BiConsumer<String, Integer> two = Handlers::pick;
    Function<Handlers, Integer> size = Handlers::size;
    register(Handlers::ping);
    return List.of(one, two, size);
  }

  public void register(Runnable action) {
    action.run();
  }

  public Map<String, Consumer<String>> unknown() {
    return Map.of("p", Handlers::pick);
  }
}
