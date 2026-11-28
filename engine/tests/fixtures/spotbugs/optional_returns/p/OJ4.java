package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class OJ4 {
static class P { @edu.umd.cs.findbugs.annotations.CheckForNull Optional<String> c() { return Optional.empty(); } } static class Q extends P { Optional<String> c() { return null; } }
}
