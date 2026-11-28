import org.checkerframework.checker.nullness.compatqual.NullableDecl;
import org.checkerframework.checker.nullness.qual.NonNull;

class S39MultipleNullnessAnnotations6<X> {
  // BUG: Diagnostic contains:
  @NullableDecl @NonNull X f;

  @NullableDecl
  // BUG: Diagnostic contains:
  @NonNull X g() {
    return null;
  }
}
