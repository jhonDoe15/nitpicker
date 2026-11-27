import java.util.List;
import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.Nullable;

@SuppressWarnings({"AnnotationPosition", "MixedArrayDimensions", "UnnecessarilyFullyQualified"})
abstract class S39NullEdges3 {
  java.lang.String @Nullable @NonNull [] a;
  List<String> @Nullable @NonNull [] b;
  String[] @Nullable @NonNull [] c;
  List<String @Nullable @NonNull []> d;
  void e(String @Nullable @NonNull ... f) {}
  void g() {
    String @Nullable @NonNull [] h = null;
    String[] @Nullable @NonNull [] i = null;
    int[] @Nullable @NonNull [] j = null;
    for (String @Nullable @NonNull [] k : new String[0][]) {}
    Object l = (String @Nullable @NonNull []) null;
    Object m = (int @Nullable @NonNull []) null;
    Object n = new String @Nullable @NonNull [0];
    boolean o = l instanceof String @Nullable @NonNull [];
  }
  List<? extends String @Nullable @NonNull []> p;
  List<java.lang.@Nullable @NonNull String> q;
  <T> void r(T @Nullable @NonNull [] s) {}
  abstract String @Nullable @NonNull [] t();
  abstract List<String> @Nullable @NonNull [] u();
  Object v = new @Nullable @NonNull Object();
  Object w = (@Nullable @NonNull int) 0;
  Object x = new int @Nullable [] @NonNull @Nullable [] {};
  Object y = new String @Nullable @NonNull [] {};
  Object z = new int @Nullable @NonNull [] {};
  void ab(String @Nullable [] @Nullable @NonNull ... ac) {}
  void ad(@Nullable int @Nullable ... ae) {}
  void af(@Nullable int @NonNull @Nullable ... ag) {}
  void ah(@Nullable String @Nullable @NonNull... ai) {}
  void ak(int @Nullable [] @NonNull ... al) {}
  void am(@Nullable int... an) {}
  abstract <T> @androidx.annotation.Nullable void aj();
}
