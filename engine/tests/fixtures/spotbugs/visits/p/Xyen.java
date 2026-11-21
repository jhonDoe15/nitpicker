package p;
import java.util.*;
public class Xyen { private List<String> f; private Xyen() { f = Collections.emptyList(); } public List<String> get() { return f; } public static Bld nb() { return new Bld(); }
  public static class Rb { public List<String> build() { return new ArrayList<>(); } }
  public static class Bld { private int bits; private List<String> f = Collections.emptyList(); private Rb b;
    private void ensure() { if (!((bits & 4) != 0)) { f = new ArrayList<String>(f); bits |= 4; } }
    public Bld clear() { if (b == null) { f = Collections.emptyList(); } else { f = null; } return this; }
    public Xyen build() { Xyen r = new Xyen(); fill(r); return r; }
    private void fill(Xyen r) { if ((bits & 4) != 0) { f = Collections.unmodifiableList(f); bits = bits & ~4; } r.f = f; }
    public Bld merge(Xyen o) { if (f.isEmpty()) { f = o.f; bits = bits & ~4; } else { ensure(); f.addAll(o.f); } return this; }
    public List<String> get() { if (b == null) { return Collections.unmodifiableList(f); } else { return b.build(); } } } }
