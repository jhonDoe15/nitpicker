package printed;
import java.util.*;
import java.lang.annotation.*;
@Target(ElementType.TYPE_USE) @interface Nullable {}
@Target(ElementType.TYPE_USE) @interface NonNull {}
@Target(ElementType.TYPE_USE) @interface Zz {}
@Target(ElementType.TYPE_USE) @interface CheckForNull {}
@Target(ElementType.TYPE_USE) @interface Size {}
@Target(ElementType.TYPE_USE) @interface NotBlank {}
class Outer { @Target(ElementType.TYPE_USE) @interface Inn {} }
class H<T> {
    class In<Q extends Number> {}
    H() { a(null); b(null); c(null); d(null); e(null); }
    public void a(@Nullable @NonNull @Zz @CheckForNull @Size @NotBlank @Outer.Inn String x) {}
    public void b(@Zz @Zz String x) {}
    public void c(In x) {}
    public void d(@Zz List<@Zz String> x) {}
    public void e(List<@Zz String> @NonNull @Nullable [] x) {}
}
