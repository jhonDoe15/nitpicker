package u;

import java.util.List;
import lib.Promises;

public class Promised {
  static final boolean LOCAL = true;

  int lengths(String text) {
    int total = Promises.spread().length();
    total += Promises.spread("a").length();
    total += Promises.spread("a", "b").length();
    total += Promises.after("a").length();
    total += Promises.after("a", "b", "c").length();
    total += Promises.chosen(null, LOCAL).length();
    total += Promises.chosen(null, Promises.SURE).length();
    total += Promises.chosen(null, !false).length();
    total += Promises.chosen(null, false).length();
    total += Promises.checked(text != null).length();
    total += Promises.checked(text == null).length();
    total += Promises.pure("x").length();
    return total;
  }

  void rows() {
    Promises.rows((String[]) null);
    Promises.rows((String[][]) null);
    Promises.rows(null, null);
  }

  static void need(String[] cells, String[] rest, String last) {}

  static <T> void needAll(T one, List<T> all) {}

  void references() {
    Promises.Grid grid = Promised::need;
    Promises.Listed<String> listed = Promised::needAll;
  }
}
