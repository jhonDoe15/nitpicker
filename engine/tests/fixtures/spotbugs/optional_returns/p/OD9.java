package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class OD9 {
interface I { @javax.annotation.CheckForNull Optional<String> c(); } static class A implements I { public Optional<String> c() { return null; } }
}
