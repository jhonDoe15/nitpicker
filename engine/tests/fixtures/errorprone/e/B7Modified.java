package e;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

class B7Modified {
  static int sideEffect() {
    return 1;
  }

  void collections(List<String> other) {
    List<String> a = new ArrayList<>();
    a.add("x");
    a.add("y");

    List<Integer> b = new ArrayList<>();
    b.add(sideEffect());

    Map<String, String> c = new HashMap<>();
    c.put("a", "b");
    c.clear();

    List<String> d = new ArrayList<>();
    d.add("x");
    System.out.println(d);

    List<String> e = new ArrayList<>();
    if (e.add("x")) {
      return;
    }

    List<String> f = new ArrayList<>();
    other.addAll(f);

    List<String> g = new ArrayList<>();
    boolean added = g.add("x");

    List<String> unusedList = new ArrayList<>();
    unusedList.add("x");

    List<String> h;
    h = new ArrayList<>();
    h.add("x");

    List<String> i = new ArrayList<>(other);
    i.add("z");
    int size = i.size();

    List<String> j = new ArrayList<>();
    j = other;
    j.add("x");

    List<String> k = new ArrayList<>(sideEffectList());
    k.add("x");

    List<String> l = new ArrayList<>();

    Map<String, String> n = new HashMap<>();
    var previous = n.put("a", "b");
  }

  static List<String> sideEffectList() {
    return null;
  }

  @SuppressWarnings("ModifiedButNotUsed")
  void suppressed() {
    List<String> m = new ArrayList<>();
    m.add("x");
  }
}
