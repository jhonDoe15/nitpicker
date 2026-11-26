package s;
public class M {
    @CheckForNull Object f() { return null; }
    int g() { return f().hashCode(); }
    @CheckForNull Boolean b() { return null; }
}
