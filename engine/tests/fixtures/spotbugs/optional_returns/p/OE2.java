package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class OE2 {
static class P { @javax.annotation.CheckForNull Optional<String> c() { return null; } } static class Q extends P { } static class R extends Q { Optional<String> c() { return null; } }
}
