import com.google.common.collect.ImmutableList;

class S38Pmi32 {
  String f(Object o) {
    o = o.toString();
    if (o instanceof String) {
      return (String) o;
    }
    return null;
  }
}
