package kit;

import java.io.InputStream;
import java.util.List;
import lombok.Builder;
import lombok.Cleanup;
import lombok.Getter;
import lombok.Locked;
import lombok.NonNull;
import lombok.Setter;
import lombok.SneakyThrows;
import lombok.Synchronized;
import lombok.experimental.ExtensionMethod;
import lombok.experimental.Helper;
import lombok.val;

@ExtensionMethod(Extensions.class)
@Builder
public class Rewritten {
  @Builder.Default private int size = 1;
  @Getter(lazy = true) private final String name = "kit";
  @Setter(onMethod_ = @Deprecated) private int weight;

  /** The colour. */
  private String colour;

  @SneakyThrows
  public void load(InputStream in) {
    @Cleanup InputStream copy = in;
    copy.read();
  }

  @Synchronized
  public void grow() {
    size++;
  }

  @Locked.Read
  public int read() {
    return size;
  }

  public int count(@NonNull List<String> items) {
    final val first = items.get(0);
    @Helper
    class Counter {
      int of(String text) {
        return text.length();
      }
    }
    return of(first);
  }
}
