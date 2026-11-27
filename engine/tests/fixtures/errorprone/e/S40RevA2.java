import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.Nullable;

@SuppressWarnings("UnnecessarilyFullyQualified")
abstract class S40RevA2 {
  String s = "see @x ... here";
  String t = """
      @Nullable @NonNull ...
      """;
  // @Nullable @NonNull ...
  /* @Nullable
     @NonNull ... */
  @Nullable @NonNull Integer a;
  void f(@Nullable(
      ) String... s) {}
  void g(@Nullable @NonNull
         String ... s) {}
  void h(String @Nullable /* c */ @NonNull ... s) {}
  void i(int @Nullable // c
      @NonNull ... s) {}
  void j(@SuppressWarnings("a)b") int @Nullable @NonNull ... s) {}
  void k(@SuppressWarnings(value = {"a"}) int @Nullable @NonNull ... s) {}
  void l(String @org.jspecify.annotations.Nullable @NonNull ... s) {}
  void m(int @Nullable [] @NonNull ... s) {}
}
