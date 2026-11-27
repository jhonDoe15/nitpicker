import java.util.List;
import org.checkerframework.checker.nullness.qual.NonNull;
import org.checkerframework.checker.nullness.qual.Nullable;

class S39NullableTypeParameter3 {
  interface I {}

  interface J {}

  // BUG: Diagnostic contains:
  <@Nullable @NonNull X> void f() {}

  // BUG: Diagnostic contains:
  <@Nullable X extends @Nullable Object> void g() {}

  // BUG: Diagnostic contains:
  <@Nullable X extends I & @Nullable J> void h() {}
}
