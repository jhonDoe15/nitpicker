package e;

import com.google.common.collect.Sets;
import java.util.List;
import java.util.Set;

public interface T2CollectionsMore {
  Set<Integer> test(Set<Integer> a, Set<String> b);

  static void a(T2CollectionsMore b) {}

  static void b() {
    a(Sets::difference);
  }

  static boolean listed(List<Integer> list) {
    return list.contains("a") && list.indexOf("b") > 0;
  }
}
