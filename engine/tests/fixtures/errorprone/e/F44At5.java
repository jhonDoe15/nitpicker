import com.google.common.collect.ImmutableBiMap;

class F44At5 {
  private static final ImmutableBiMap<Integer, Integer> xs =
      ImmutableBiMap.<Integer, Integer>builder()
          .put(1, 1)
          // BUG: Diagnostic contains:
          .put(2, 1)
          .buildOrThrow();
}
