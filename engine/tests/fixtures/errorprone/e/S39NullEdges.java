import java.util.List;
import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.Nullable;

@SuppressWarnings({"AnnotationPosition", "MixedArrayDimensions", "UnnecessarilyFullyQualified"})
abstract class S39NullEdges {
  @javax.annotation.Nullable @NonNull String a;
  @Nullable @NonNull String[] b;
  @javax.annotation.Nullable @NonNull String[] c;
  String @Nullable @NonNull [] d;
  @javax.annotation.Nullable String @NonNull [] e;
  @androidx.annotation.Nullable @NonNull Object f;
  java.util.@Nullable @NonNull List<String> g;
  @javax.annotation.Nullable java.util.@NonNull List<String> h;
  @androidx.annotation.Nullable int i;
  @Nullable int j;
  @Nullable int[] k;
  int @Nullable [] l;
  @Nullable int m[];
  @androidx.annotation.Nullable int[] n;
  @javax.annotation.Nullable int[] o;
  @Nullable @androidx.annotation.Nullable int[] p;
  @Nullable int[] @NonNull [] q;

  abstract <T> @Nullable @NonNull T r();

  abstract <T> @Nullable int s();

  @javax.annotation.Nullable
  abstract <T> @NonNull T t();

  @javax.annotation.CheckForNull
  S39NullEdges() {}

  @androidx.annotation.Nullable
  abstract void u();

  void v(List<? extends @Nullable Object> w) {
    try (@Nullable @NonNull AutoCloseable x = null) {
    } catch (@javax.annotation.Nullable @NonNull RuntimeException y) {
    } catch (Exception z) {
    }
    for (@javax.annotation.Nullable @NonNull String aa : List.of("")) {}
    java.util.function.Function<String, String> bb = (@javax.annotation.Nullable @NonNull String cc) -> cc;
    @androidx.annotation.Nullable int dd = 0;
    Object ee = (@Nullable @NonNull Object) null;
  }

  record Rec(@javax.annotation.Nullable @NonNull String ff, @Nullable int gg) {}

  <@Nullable @NonNull X, @javax.annotation.Nullable Y extends Object, @Nullable Z extends @Nullable Object & Comparable<Z>> void hh() {}

  List<@Nullable @NonNull ? super Object> ii;
  List<@Nullable ? extends @NonNull Object> jj;
  List<@Nullable ? super Object> kk;

  @SuppressWarnings({"MultipleNullnessAnnotations", "NullablePrimitive"})
  @javax.annotation.Nullable @NonNull Integer ll;

  @SuppressWarnings("NullablePrimitive")
  @Nullable int mm;

  abstract @Nullable @NonNull int @NonNull @Nullable [] nn();

  abstract void oo(@Nullable byte... pp);
}
