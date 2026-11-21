package p;
import java.util.*;
public class Zxlc { private List<String> f; private Zxlc() { f = Collections.emptyList(); } private Zxlc(int b) { } public List<String> get() { return f; } public static class Bld { public Zxlc build() { Zxlc r = new Zxlc(); r.f = new ArrayList<>(); return r; }  } }
