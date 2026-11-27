import com.google.common.collect.ImmutableMap;

class F44At4 {
  private static final ImmutableMap<Integer, Integer> xs =
      ImmutableMap.<Integer, Integer>builder()
          .put(1, 1)
          // BUG: Diagnostic contains:
          .put(1, 2)
          .buildOrThrow();
}
