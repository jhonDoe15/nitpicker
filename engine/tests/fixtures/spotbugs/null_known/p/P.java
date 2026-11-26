package p;
import java.nio.file.Path;
public class P {
    static String a(Path p) {
        return p.getFileName().toString();
    }
    static int b(java.io.File f) {
        return f.listFiles().length;
    }
}
