import com.google.common.collect.ImmutableBiMap;

class F44At10 {
  ImmutableBiMap<String, Integer> map(String s) {
    // BUG: Diagnostic contains:
    return ImmutableBiMap.of(s, 1, s, 2);
  }

  ImmutableBiMap<Integer, String> values(String s) {
    // BUG: Diagnostic contains:
    return ImmutableBiMap.of(1, s, 2, s);
  }
}
