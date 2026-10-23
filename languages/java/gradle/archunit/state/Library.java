import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

final class Library {
  private static final Set<String> MAP_MUTATORS =
      Set.of("put", "putAll", "putIfAbsent", "compute", "computeIfAbsent", "computeIfPresent", "merge", "replace");
  private static final Set<String> COLLECTION_MUTATORS =
      Set.of("add", "addAll", "addFirst", "addLast", "offer", "offerFirst", "offerLast", "push", "set", "put");
  private static final Set<String> REFERENCE_MUTATORS =
      Set.of("set", "lazySet", "setPlain", "setOpaque", "setRelease", "getAndSet", "compareAndSet",
          "compareAndExchange", "compareAndExchangeAcquire", "compareAndExchangeRelease", "weakCompareAndSet",
          "weakCompareAndSetPlain", "weakCompareAndSetVolatile", "weakCompareAndSetAcquire",
          "weakCompareAndSetRelease");
  private static final Set<String> MAP_ACCESSORS =
      Set.of("get", "getOrDefault", "computeIfAbsent", "computeIfPresent", "compute", "merge", "values",
          "keySet", "entrySet", "firstEntry", "lastEntry", "floorEntry", "ceilingEntry", "headMap", "tailMap",
          "subMap");
  private static final Set<String> COLLECTION_ACCESSORS =
      Set.of("get", "iterator", "listIterator", "getFirst", "getLast", "peek", "peekFirst", "peekLast",
          "element", "first", "last", "subList", "floor", "ceiling", "headSet", "tailSet", "subSet");
  private static final Set<String> REFERENCE_ACCESSORS = Set.of("get", "getPlain", "getAcquire", "getOpaque");
  private static final Map<String, Set<String>> SOURCES =
      Map.of(
          "org/springframework/web/context/request/RequestContextHolder",
          Set.of("getRequestAttributes", "currentRequestAttributes"),
          "org/springframework/security/core/context/SecurityContextHolder", Set.of("getContext"),
          "org/springframework/security/core/context/ReactiveSecurityContextHolder", Set.of("getContext"));
  private static final List<String> REQUEST_TYPES =
      List.of(
          "jakarta.servlet.ServletRequest",
          "javax.servlet.ServletRequest",
          "org.springframework.web.context.request.WebRequest",
          "org.springframework.http.server.ServerHttpRequest",
          "org.springframework.web.server.ServerWebExchange",
          "org.springframework.web.servlet.function.ServerRequest",
          "org.springframework.web.reactive.function.server.ServerRequest");

  private final Map<String, Optional<Class<?>>> loaded = new HashMap<>();

  boolean isMutator(String owner, String name) {
    return (is(owner, Map.class) && MAP_MUTATORS.contains(name))
        || (is(owner, java.util.Collection.class) && COLLECTION_MUTATORS.contains(name))
        || (isReference(owner) && REFERENCE_MUTATORS.contains(name))
        || (is(owner, Map.Entry.class) && name.equals("setValue"));
  }

  boolean isAccessor(String owner, String name) {
    return (is(owner, Map.class) && MAP_ACCESSORS.contains(name))
        || (is(owner, java.util.Collection.class) && COLLECTION_ACCESSORS.contains(name))
        || (isReference(owner) && REFERENCE_ACCESSORS.contains(name))
        || (is(owner, java.util.Iterator.class) && name.equals("next"))
        || (is(owner, Map.Entry.class) && name.equals("getValue"));
  }

  Optional<String> source(String owner, String name) {
    return SOURCES.getOrDefault(owner, Set.of()).contains(name)
        ? Optional.of(owner.substring(owner.lastIndexOf('/') + 1) + "." + name + "()")
        : Optional.empty();
  }

  boolean isRequest(String className) {
    Optional<Class<?>> type = load(className.replace('.', '/'));
    return type.isPresent()
        && REQUEST_TYPES.stream()
            .map(name -> load(name.replace('.', '/')))
            .anyMatch(request -> request.isPresent() && request.get().isAssignableFrom(type.get()));
  }

  private boolean isReference(String owner) {
    return is(owner, java.util.concurrent.atomic.AtomicReference.class)
        || is(owner, java.util.concurrent.atomic.AtomicReferenceArray.class);
  }

  private boolean is(String owner, Class<?> kind) {
    Optional<Class<?>> type = load(owner);
    return type.isPresent() && kind.isAssignableFrom(type.get());
  }

  private Optional<Class<?>> load(String internalName) {
    return loaded.computeIfAbsent(internalName, name -> {
      try {
        return Optional.of(Class.forName(name.replace('/', '.'), false, Library.class.getClassLoader()));
      } catch (ClassNotFoundException | LinkageError absent) {
        return Optional.empty();
      }
    });
  }
}
