import org.checkerframework.checker.nullness.qual.NonNull;
import org.checkerframework.checker.nullness.qual.Nullable;

abstract class S39NullablePrimitiveArray1 {
  @Nullable
  abstract byte[] f();

  abstract @Nullable byte[] g();

  abstract void h(@Nullable byte[] x);

  abstract void i(@Nullable byte @Nullable [] x);

  abstract void j(@Nullable byte... x);

  abstract void k(@Nullable byte[][][] x);

  abstract void l(@NonNull byte[] x);
}
