import java.util.List;
import org.checkerframework.checker.nullness.qual.NonNull;
import org.checkerframework.checker.nullness.qual.Nullable;

class S39NullableWildcard1 {
  List<@Nullable ?> xs;
  List<@NonNull ?> ys;
}
