import java.util.List;
import org.checkerframework.checker.nullness.qual.NonNull;
import org.checkerframework.checker.nullness.qual.Nullable;

class S39NullableTypeParameter2 {
  interface I {}

  interface J {}

  <@Nullable @NonNull X> void f() {}

  <@Nullable X extends @Nullable Object> void g() {}

  <@Nullable X extends I & @Nullable J> void h() {}
}
