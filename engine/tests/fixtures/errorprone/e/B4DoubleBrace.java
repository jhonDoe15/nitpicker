package e;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class B4DoubleBrace {
  static final Map<String, Integer> CONSTANT = new HashMap<>() {{
    put("a", 1);
    put("b", 2);
  }};

  static final List<String> LIST = Collections.unmodifiableList(new ArrayList<>() {{
    add("a");
    add("b");
  }});

  final Set<String> instance = new HashSet<String>() {{ add("x"); }};

  List<String> returned() {
    return new ArrayList<>() {{ add("r"); }};
  }

  List<String> returnedWrapped() {
    return (Collections.unmodifiableList((new ArrayList<String>() {{ add("r"); }})));
  }

  void local() {
    Map<String, String> map = new HashMap<>() {{
      put("k", "v");
    }};
    Set<String> withNull = new HashSet<>() {{
      add(null);
    }};
    Set<String> other = new HashSet<>() {{
      add("a");
      remove("a");
    }};
    Collection<String> coll = new ArrayList<>() {{
      add("a");
    }};
    foo(new HashSet<String>() {{ add("p"); }});
    Map<String, Integer> big = new LinkedHashMap<String, Integer>() {{
      put("1", 1);
      put("2", 2);
      put("3", 3);
      put("4", 4);
      put("5", 5);
      put("6", 6);
    }};
    Map<Integer, Integer> bigConst = Collections.unmodifiableMap(new HashMap<>() {{
      put(1, 1);
      put(2, 2);
      put(3, 3);
      put(4, 4);
      put(5, 5);
      put(6, 6);
    }});
    List<String> twoStatements = new ArrayList<>() {{
      add("a");
      this.add("b");
    }};
    List<String> empty = new ArrayList<>() {{ }};
    List<String> parens = new ArrayList<>() {{ add(("a")); }};
    Object plain = new Object() {{ }};
    List<String> withMethod = new ArrayList<String>() {
      void extra() {}
      {
        add("a");
      }
    };
    List<String> assigned;
    assigned = new ArrayList<>() {{ add("z"); }};
  }

  void foo(Set<String> s) {}

  @SuppressWarnings("DoubleBraceInitialization")
  void sup() {
    Set<String> s = new HashSet<>() {{ add("x"); }};
  }
}
