package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class OI1 {
Optional<String> c() { try { return Optional.empty(); } catch (RuntimeException e) { try { return null; } finally { System.out.println(); } } }
}
