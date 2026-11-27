import com.google.common.collect.ImmutableMap;

class F44At8 {
  private enum E {
    A,
    B
  }

  private static final ImmutableMap<E, Integer> xs =
      // BUG: Diagnostic contains:
      ImmutableMap.of(E.A, 1, E.A, 2);
}
