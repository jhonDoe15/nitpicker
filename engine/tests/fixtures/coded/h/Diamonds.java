package h;
import java.util.*;
class Diamonds {
    enum Color { R, G }
    Set<Color> z = new HashSet<>(unknownCall());
    List<Set<Color>> u = List.of(new HashSet<>());
    Map<Color, String> sw(int i) {
        return switch (i) {
            case 1 -> new HashMap<>();
            case 2 -> { yield new HashMap<>(); }
            default -> new HashMap<>(Map.of(Color.R, "x"));
        };
    }
    Set<Color> plain = new HashSet<>();
    void m(Set<Color> s) {}
    void call() { m(new HashSet<>()); }
    Map<Color, String> tern(boolean b) { return b ? new HashMap<>() : new EnumMap<>(Color.class); }
    Collection<Set<Color>> u2 = Collections.singleton(new HashSet<>());
    List<Set<Color>> u3 = List.of(new HashSet<>(), new HashSet<>());
    List<Set<Color>> u4 = Arrays.asList(new HashSet<>());
    Map<Color, Set<Color>> u5 = Map.of(Color.R, new HashSet<>());
    Optional<Map<Color, String>> u6 = Optional.of(new HashMap<>());
    List<Set<Color>> u7 = new ArrayList<>(List.of(new HashSet<>()));
    Set<Color> u8 = new HashSet<>(missing.call());
    Set<? extends Color> u9 = new HashSet<>(unknownCall());
    Map<Color, String> sw2(int i) {
        switch (i) { case 1: return new HashMap<>(); default: return null; }
    }
    Object sw3(int i) {
        Map<Color, String> m = switch (i) { case 1: yield new HashMap<>(); default: yield null; };
        return m;
    }
    Set<Color> u10 = i() ? new HashSet<>(unknownCall()) : null;
    static boolean i() { return true; }
    Set<Color> u11 = new HashSet<>(unknownCall(), 3);
}
class Diamonds3 {
    enum E { A, B }
    void d() {
        foo(new HashMap<>(missing()));
    }
    void foo(Map<E, String> m) {}
    void foo(Map<String, String> m, int x) {}
}
class Diamonds2 {
    Set<? extends Diamonds.Color> w1 = new HashSet<>();
    Set<? super Diamonds.Color> w2 = new HashSet<>(unknownCall());
    Set<? super Diamonds.Color> w3 = new HashSet<>();
}
