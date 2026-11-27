package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class OE3 {
interface I { @javax.annotation.CheckForNull default Optional<String> c() { return null; } }
}
