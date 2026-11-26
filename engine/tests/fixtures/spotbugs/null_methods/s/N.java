package s;
import java.lang.annotation.*;
public class N {
    @Retention(RetentionPolicy.RUNTIME) @interface CheckForNull {}
    @Retention(RetentionPolicy.CLASS) @interface CheckForNull2 {}
    @CheckForNull Object f() { return null; }
    int g() { return f().hashCode(); }
}
