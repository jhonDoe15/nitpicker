package shop.values;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class TypeKeys {
  private final Map<String, String> definitions = new ConcurrentHashMap<>();

  String key(Object o) {
    StringBuilder key = new StringBuilder(o.getClass().getCanonicalName()); // violation: CanonicalNameMayBeNull
    return key.append('#').toString();
  }

  String definition(Class<?> clazz) {
    return definitions.get(clazz.getCanonicalName()); // violation: CanonicalNameMayBeNull
  }

  void register(Class<?> clazz, String definition) {
    definitions.computeIfAbsent(clazz.getCanonicalName(), name -> definition); // violation: CanonicalNameMayBeNull
  }

  String message(Class<?> from) {
    return "no converter from type: " + from.getCanonicalName(); // violation: CanonicalNameMayBeNull
  }

  boolean sameAs(Class<?> type, String name) {
    return type.getCanonicalName().equals(name); // violation: CanonicalNameMayBeNull
  }

  String nameKey(Object o) {
    return new StringBuilder(o.getClass().getName()).toString();
  }

  String literalKey() {
    return definitions.get(String.class.getCanonicalName());
  }

  String guarded(Class<?> clazz) {
    String name = clazz.getCanonicalName() != null ? clazz.getCanonicalName() : clazz.getName();
    return definitions.get(name);
  }

  String display(Class<?> clazz) {
    return "type: " + clazz.getSimpleName();
  }

  boolean matches(Class<?> type, String name) {
    return name.equals(type.getCanonicalName());
  }

  enum Mode {
    FAST, SLOW
  }

  private static final Class<?> ENTRY_TYPE = Mode.class;

  void fail(Class<?> clazz) {
    throw new IllegalStateException("no converter for " + clazz.getCanonicalName());
  }

  @Override
  public String toString() {
    return "keys of " + definitions.getClass().getCanonicalName();
  }

  void append(StringBuilder out, Class<?> clazz) {
    out.append(clazz.getCanonicalName());
  }

  boolean annotated(java.lang.annotation.Annotation annotation) {
    return annotation.annotationType().getCanonicalName().startsWith("shop.");
  }

  String modeKey(Mode mode, Class<? extends Enum<?>> enumType) {
    return definitions.get(mode.getDeclaringClass().getCanonicalName() + enumType.getCanonicalName());
  }

  String constantKey() {
    return definitions.get(ENTRY_TYPE.getCanonicalName());
  }

  String literalOwners(String text) {
    return definitions.get(text.getClass().getCanonicalName() + new Object().getClass().getCanonicalName());
  }

  boolean guardedByKind(Class<?> clazz) {
    if (clazz.isAnonymousClass() || clazz.isLocalClass()) {
      return false;
    }
    return clazz.getCanonicalName().startsWith("shop.");
  }
}
