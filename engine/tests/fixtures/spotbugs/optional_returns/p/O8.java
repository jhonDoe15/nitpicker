package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class O8 {
static class P { @javax.annotation.CheckForNull Optional<String> c() { return Optional.empty(); } } static class Q extends P { Optional<String> c() { return null; } }
}
