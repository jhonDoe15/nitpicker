import com.google.common.collect.ImmutableList;

class S38Pmi31 {
  int f(ImmutableList<Object> xs) {
    if (xs.get(0) instanceof Integer) {
      return (Integer) xs.get(0);
    }
    return 0;
  }
}
