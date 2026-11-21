package p;
import java.util.*;
public class Secleok { private List<String> f; private Secleok() { f = Collections.emptyList(); } public List<String> get() { return f; } public static Bld nb() { return new Bld(); }
  public static class Rb { public List<String> build() { return new ArrayList<>(); } }
  public static class Bld { private int bits; private List<String> f = Collections.emptyList(); private Rb b;
    private void ensure() { if (!((bits & 4) != 0)) { f = new ArrayList<String>(f); bits |= 4; } }
    public Bld clear() { if (b == null) { f = Collections.emptyList(); } else { f = null; } return this; }
    public Secleok build() { Secleok r = new Secleok(); fill(r); return r; }
    private void fill(Secleok r) { if (b == null) { if ((bits & 4) != 0) { f = Collections.unmodifiableList(f); bits = bits & ~4; } r.f = f; } else { r.f = b.build(); } }
    public Bld merge(Secleok o) { if (f.isEmpty()) { f = o.f; bits = bits & ~4; } else { ensure(); f.addAll(o.f); } return this; }
    public List<String> get() { if (b == null) { return Collections.unmodifiableList(f); } else { return b.build(); } } } }
