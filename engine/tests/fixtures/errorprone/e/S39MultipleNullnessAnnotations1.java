import java.util.List;
import org.checkerframework.checker.nullness.compatqual.NonNullDecl;
import org.checkerframework.checker.nullness.compatqual.NullableDecl;
import org.checkerframework.checker.nullness.qual.NonNull;
import org.checkerframework.checker.nullness.qual.Nullable;

abstract class S39MultipleNullnessAnnotations1 {
  // BUG: Diagnostic contains:
  @Nullable @NonNull Object x;
  // BUG: Diagnostic contains:
  @NullableDecl static @NonNull Object y;
  // BUG: Diagnostic contains:
  List<@Nullable @NonNull String> z;

  @NullableDecl
  // BUG: Diagnostic contains:
  abstract @NonNull Object f();

  // BUG: Diagnostic contains:
  abstract void f(@NullableDecl Object @NonNull [] x);
}
