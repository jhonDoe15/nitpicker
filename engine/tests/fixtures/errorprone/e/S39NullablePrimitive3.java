import java.util.List;
import org.checkerframework.checker.nullness.qual.Nullable;

class S39NullablePrimitive3 {
  // BUG: Diagnostic contains:
  List<@Nullable int[]> xs;
}
