package kit;

import java.util.List;
import lombok.Getter;
import lombok.val;
import org.jspecify.annotations.NonNull;

public class Untouched {
  @Getter(lazy = false) private int size;

  /** Not read by any accessor Lombok writes. */
  private String colour;

  public int count(@NonNull List<String> items) {
    val first = items.get(0);
    for (val item : items) {
      first.concat(item);
    }
    return first.length();
  }
}
