

import com.google.errorprone.annotations.InlineMe;
import java.util.ArrayList;

public final class J5Iv42<E> {
  @InlineMe(replacement = "new ArrayList<E>()", imports = "java.util.ArrayList")
  @Deprecated
  // BUG: Diagnostic contains: deprecated or less visible API elements: E
  public ArrayList<E> create() {
    return new ArrayList<E>();
  }
}
