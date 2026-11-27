import java.util.List;
import org.checkerframework.checker.nullness.compatqual.NonNullDecl;
import org.checkerframework.checker.nullness.compatqual.NullableDecl;
import org.checkerframework.checker.nullness.qual.NonNull;
import org.checkerframework.checker.nullness.qual.Nullable;

abstract class S39MultipleNullnessAnnotations2 {
  @NonNullDecl @NonNull Object x;
  @NullableDecl static @Nullable Object y;
}
