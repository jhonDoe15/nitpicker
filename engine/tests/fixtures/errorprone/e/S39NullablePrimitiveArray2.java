import org.checkerframework.checker.nullness.qual.Nullable;

abstract class S39NullablePrimitiveArray2 {
  @SuppressWarnings("SomeOtherChecker") // unrelated annotation
  @Nullable
  abstract byte[] f();
}
