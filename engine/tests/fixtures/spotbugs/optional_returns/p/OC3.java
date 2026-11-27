package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class OC3 {
Optional<String> c(Object o) { synchronized (o) { System.out.println(); } return null; }
}
