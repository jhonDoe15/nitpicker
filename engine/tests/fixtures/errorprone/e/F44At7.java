import com.google.common.collect.ImmutableMap;

class F44At7 {
  private static final ImmutableMap<Integer, Integer> xs =
      // BUG: Diagnostic contains:
      ImmutableMap.of(1, 1, 1, 2);
}
