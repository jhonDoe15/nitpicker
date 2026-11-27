import java.util.Map;

class S38Pmi14 {
  void test(Object x, String k) {
    if (x instanceof Map) {
      @SuppressWarnings("unchecked")
      Map<String, Integer> m = (Map<String, Integer>) x;
      System.err.println(m.get(k));
    }
  }
}
