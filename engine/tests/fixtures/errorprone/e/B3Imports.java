package e;

import static java.lang.Integer.valueOf;
import static java.util.List.of;
import static java.util.Map.Entry;
import static java.util.Optional.ofNullable;

import java.util.List;
import java.util.Locale.Builder;
import java.util.Map;
import java.util.stream.Collectors;

class B3Imports {
  List<Integer> list = of(1, 2);
  Integer number = valueOf("3");

  Builder builder() {
    Builder b = new Builder();
    return b.setLanguage("en");
  }

  Entry<String, String> entry(Map<String, String> map) {
    for (Entry<String, String> e : map.entrySet()) {
      return e;
    }
    return null;
  }

  Object optional() {
    return ofNullable(null);
  }

  Object more() {
    return of(3).stream().map(x -> valueOf(x)).collect(Collectors.toList());
  }
}

class B3Imports2 {
  List<String> other = of("a");
}
