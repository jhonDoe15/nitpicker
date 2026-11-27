import javax.annotation.CheckForNull;
import org.checkerframework.checker.nullness.qual.NonNull;

class S39MultipleNullnessAnnotations7 {
  // BUG: Diagnostic contains:
  @CheckForNull Object @NonNull [] f;
}
