package legacy;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

public final class Shapes {
  public int area(Object shape) {
    if (shape instanceof String) {
      return ((String) shape).length();
    }
    return 0;
  }

  public List<String> upper(List<String> names) {
    return names.stream().map(String::trim).collect(Collectors.toList());
  }

  public String first(Optional<String> name) {
    return name.get();
  }
}
