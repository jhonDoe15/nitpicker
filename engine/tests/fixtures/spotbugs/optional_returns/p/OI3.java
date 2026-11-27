package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class OI3 {
Optional<String> c(Object o) { synchronized (o) { synchronized (this) { return null; } } }
}
