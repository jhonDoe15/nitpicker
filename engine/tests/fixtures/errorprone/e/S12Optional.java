package e;

import com.google.common.collect.ImmutableMap;
import java.util.Optional;

class S12Optional {
  void mapUnused(Optional<String> opt) {
    opt.map(String::length);
    opt.map(s -> s.length());
    opt.map(s -> {
      System.out.println(s);
      return s;
    });
    opt.map(s -> s);
    opt.map(s -> new Object());
    opt.map(s -> (s.length()));
    Optional<Integer> used = opt.map(String::length);
    int length = opt.map(String::length).orElse(0);
    opt.map(String::length).orElse(0);
    foo(opt.map(String::length));
    opt.ifPresent(String::length);
  }

  @SuppressWarnings("OptionalMapUnusedValue")
  void mapUnusedSuppressed(Optional<String> opt) {
    opt.map(String::length);
  }

  void foo(Optional<Integer> value) {}

  void redundant() {
    Optional.of("test").ifPresent(String::length);
    Optional.of("test").orElse("test2");
    Optional.of("test").orElseGet(() -> "test2");
    Optional.of("test").isPresent();
    if (Optional.of("test").isPresent()) {}
  }

  String redundantReturn(ImmutableMap<String, String> map) {
    String a = Optional.of("test").orElse("test2");
    String b = Optional.of("test").orElseGet(() -> "test2");
    String c = Optional.of(map.get("test")).orElseThrow(IllegalArgumentException::new);
    boolean d = Optional.of("test").isPresent();
    return Optional.of("test").orElse("test2");
  }

  void redundantGuava() {
    com.google.common.base.Optional.of("test").isPresent();
    if (com.google.common.base.Optional.of("test").isPresent()) {}
    com.google.common.base.Optional.of("test").or("");
    String a = com.google.common.base.Optional.of("test").or("");
    com.google.common.base.Optional.of("test").orNull();
    String b = com.google.common.base.Optional.of("test").orNull();
  }

  void notRedundant(Optional<String> opt, String value) {
    opt.ifPresent(String::length);
    Optional.of(value).filter(x -> x.length() < 5).orElse("test");
    Optional.of(value).map(String::length);
    Optional.ofNullable(value).isPresent();
  }

  boolean notRedundantGuava(com.google.common.base.Optional<String> opt) {
    return opt.isPresent();
  }

  @SuppressWarnings("OptionalOfRedundantMethod")
  void redundantSuppressed() {
    Optional.of("test").orElse("test2");
  }
}
