package p;
public class G37 implements java.io.Serializable {
 private static final G37 I = new G37();
 public static synchronized G37 get() { return I; }
 public static G37 other() { return I; }
}
