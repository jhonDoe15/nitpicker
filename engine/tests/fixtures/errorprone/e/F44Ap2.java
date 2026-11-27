import com.google.common.collect.ImmutableBiMap;
import com.google.common.collect.ImmutableMap;
import com.google.common.collect.ImmutableSortedMap;
import com.google.protobuf.ByteString;
import java.time.Duration;
import java.time.Instant;
import java.time.Period;

class F44Ap2 {
  private static final String KEY = "k";
  private final String field = "f";

  enum E {
    A,
    B
  }

  void maps(String s) {
    final String local = s;
    ImmutableMap.<String, Integer>builder().put("a", 1).put("b", 2).put("a", 3).put("b", 4).buildOrThrow();
    ImmutableMap.<String, Integer>builder().put(KEY, 1).put("k", 2).buildOrThrow();
    ImmutableMap.<String, Integer>builder().put(local, 1).put(local, 2).buildOrThrow();
    ImmutableMap.<String, Integer>builder().put(field, 1).put(this.field, 2).buildOrThrow();
    ImmutableMap.<Object, Integer>builder().put(1, 1).put(1L, 2).put('a', 3).put(97, 4).buildOrThrow();
    ImmutableMap.<Integer, Integer>builder().put(-1, 1).put(-1, 2).buildOrThrow();
    ImmutableMap.<E, Integer>builder().put(E.A, 1).put(E.B, 2).put(E.A, 3).put(E.A, 4).buildOrThrow();
    (ImmutableMap.<Integer, Integer>builder().put(1, 1)).put(1, 2).buildOrThrow();
    ImmutableMap.<Integer, Integer>builder().put(1, 1).put(java.util.Map.entry(1, 2)).put(1, 3).buildOrThrow();
    ImmutableMap.<Integer, Integer>builder().put(1, ImmutableMap.of(2, 2, 2, 3).size()).buildOrThrow();
    ImmutableMap.of("x" + "y", 1, "xy", 2, "z", 3);
    ImmutableMap.of(s, 1, s, 2);
    ImmutableMap.of(s.length(), 1, s.length(), 2);
    ImmutableBiMap.of(1, "a", 2, "a");
    ImmutableBiMap.<Integer, String>builder().put(1, "a").put(2, "a").buildOrThrow();
    ImmutableBiMap.<Integer, String>builder().put(1, "a").put(1, "b").buildOrThrow();
    ImmutableSortedMap.of("a", 1, "a", 2);
  }

  @SuppressWarnings("AlwaysThrows")
  void suppressed() {
    ImmutableMap.of(1, 1, 1, 2);
    Duration.parse("x");
  }

  void others(Instant instant, Period period) {
    ByteString.fromHex("abc");
    ByteString.fromHex("zz");
    ByteString.fromHex("0aFF");
    instant.plus(Period.ofMonths(1));
    instant.minus(Period.ofYears(2));
    instant.plus(Period.ofDays(2));
    instant.plus((Period.ofMonths(1)));
    instant.plus(period);
    Instant.now().minus(Period.ofMonths(3));
  }
}
