package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class OI4 {
Optional<String> c(Object o) { Runnable r = () -> { synchronized (o) { } }; return null; }
}
