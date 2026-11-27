package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class OE5 {
static abstract class P<T> { abstract T c(); } static class Q extends P<Optional<String>> { Optional<String> c() { return null; } }
}
