import java.util.List;
import org.checkerframework.checker.nullness.qual.NonNull;
import org.checkerframework.checker.nullness.qual.Nullable;

class S39NullableWildcard2 {
  List<@Nullable ? extends @Nullable Object> x;
  List<@Nullable ? super Object> y;
  List<@Nullable @NonNull ?> z;
}
