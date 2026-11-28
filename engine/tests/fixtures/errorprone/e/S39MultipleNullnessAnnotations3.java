import java.util.List;
import org.checkerframework.checker.nullness.qual.Nullable;

abstract class S39MultipleNullnessAnnotations3 {
  @Nullable Object @Nullable [] x;

  abstract void f(@Nullable Object @Nullable ... x);
}
