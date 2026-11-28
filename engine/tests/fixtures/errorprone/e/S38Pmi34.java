import java.nio.file.Path;
import java.util.ArrayList;

public class S38Pmi34 {
  void superinterface() {
    Object o = Path.of(".");
    if (o instanceof Path) {
      f((Iterable<?>) o);
    }
  }

  void f(Comparable<?> c) {}

  void f(Iterable<?> c) {}

  void f(Path p) {}

  void rawtypes() {
    Object o = new ArrayList<Integer>();
    if (o instanceof ArrayList<?>) {
      @SuppressWarnings("rawtypes")
      ArrayList list = (ArrayList) o;
      rawTypeNecessary(list);
    }
  }

  void rawTypeNecessary(ArrayList<Integer> l) {}
}
