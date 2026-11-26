package r;
import java.lang.annotation.*;
public class N {
    @Retention(RetentionPolicy.CLASS) @interface Nullable {}
    @Retention(RetentionPolicy.RUNTIME) @interface CheckForNull {}
    @javax.annotation.Nullable Boolean a() { return null; }
    @javax.annotation.CheckForNull Boolean b() { return null; }
    @edu.umd.cs.findbugs.annotations.CheckForNull Boolean c() { return null; }
    @edu.umd.cs.findbugs.annotations.Nullable Boolean d() { return null; }
    @Nullable Boolean e() { return null; }
    @CheckForNull Boolean f() { return null; }
    @javax.annotation.Nonnull Boolean g() { return null; }
    static class S extends N { @Override Boolean b() { return null; } }
    interface I { @javax.annotation.CheckForNull Boolean h(); }
    static class T implements I { public Boolean h() { return null; } }
    @javax.annotation.CheckForNull java.util.Optional<String> o() { return null; }
}
