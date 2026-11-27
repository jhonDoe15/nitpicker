import static java.util.UUID.fromString;

import com.google.common.collect.ImmutableMap;
import java.time.LocalTime;

class F44Ap3 {
  static final Object NOTHING = null;

  void order() {
    ImmutableMap.<String, Integer>builder().put("b", 1).put("a", 2).put("b", 3).put("a", 4).buildOrThrow();
    ImmutableMap.<Integer, Integer>builder().put(17, 1).put(1, 1).put(33, 1).put(2, 1).put(33, 1).put(2, 1).put(1, 1).put(17, 1).buildOrThrow();
    ImmutableMap.<Integer, Integer>builder().put(0x10, 1).put(16, 2).put(010, 3).put(8, 4).buildOrThrow();
    ImmutableMap.<Object, Integer>builder().put(1.0, 1).put(1.0d, 2).put(1.5f, 3).put(1.5f, 4).put(true, 5).put(true, 6).buildOrThrow();
    ImmutableMap.<Object, Integer>builder().put('x', 1).put('x', 2).put(null, 3).put(null, 4).put(-0.0, 5).put(0.0, 6).buildOrThrow();
    ImmutableMap.<Integer, Integer>builder()
        .put(1, 0).put(2, 0).put(3, 0).put(4, 0).put(5, 0).put(6, 0).put(7, 0).put(8, 0).put(9, 0).put(10, 0)
        .put(11, 0).put(12, 0).put(13, 0).put(14, 0).put(30, 0).put(46, 0).put(14, 0).put(30, 0).put(46, 0).put(13, 0)
        .buildOrThrow();
    ImmutableMap.<String, Integer>builder().put("Aa", 1).put("BB", 2).put("BB", 3).put("Aa", 4).put("hello", 5).put("hello", 6).buildOrThrow();
    ImmutableMap.<Object, Integer>builder().put(NOTHING, 1).put(NOTHING, 2).put("z", 3).buildOrThrow();
  }

  void parse() {
    fromString("not-a-uuid-at-all");
    LocalTime.parse("""
        10:15""");
    LocalTime.parse("١٠:15");
  }
}
