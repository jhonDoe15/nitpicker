import java.util.List;

class S38Pmi17 {
  void test(Object object) {
    if (object instanceof List) {
      @SuppressWarnings("unchecked")
      List<? extends CharSequence> xs = (List) object;
    }
  }
}
