package p;
import java.util.*;
public class Hnq { private List<String> f; private Hnq() { f = Collections.emptyList(); } private Hnq(String b) { } public List<String> get() { return f; } public static class Bld { public Hnq build() { Hnq r = new Hnq("x"); r.f = new ArrayList<>(); return r; }  } }
