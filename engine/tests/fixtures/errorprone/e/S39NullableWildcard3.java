import java.util.List;
import org.checkerframework.checker.nullness.qual.NonNull;
import org.checkerframework.checker.nullness.qual.Nullable;

class S39NullableWildcard3 {
  // BUG: Diagnostic contains:
  List<@Nullable ? extends @Nullable Object> x;
  // BUG: Diagnostic contains:
  List<@Nullable ? super Object> y;
  // BUG: Diagnostic contains:
  List<@Nullable @NonNull ?> z;
}
