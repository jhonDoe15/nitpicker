import java.util.List;
import org.checkerframework.checker.nullness.qual.NonNull;
import org.checkerframework.checker.nullness.qual.Nullable;

class S39NullableTypeParameter1 {
  interface I {}

  interface J {}

  <@Nullable X, @NonNull Y> void f() {}

  <@Nullable X extends Object> void h() {}

  <@Nullable X extends I & J> void i() {}
}
