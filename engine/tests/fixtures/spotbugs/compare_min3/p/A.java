package p;
import java.util.*;
class V { int i; int j; char c; }
class N1 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.i == 5) { if (a.j == b.j) return Integer.MIN_VALUE; } return 0; } }
class N2 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.j == b.j) { if (a.i == 5) return Integer.MIN_VALUE; } return 0; } }
class N3 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.i == 5 && a.j == b.j) return Integer.MIN_VALUE; return 0; } }
class N4 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.j == b.j && a.i == 5) return Integer.MIN_VALUE; return 0; } }
class N5 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.i == 5 || a.j == 7) return Integer.MIN_VALUE; return 0; } }
class N6 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.i == 5) { foo(); } return Integer.MIN_VALUE; } }
class N7 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.i == 5) { foo(); } else { foo(); } return Integer.MIN_VALUE; } }
class N8 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.i == 5) return 1; else if (a.i == 6) return 2; return Integer.MIN_VALUE; } }
class N9 implements Comparator<V> { void foo() {} public int compare(V a, V b) { switch (a.i) { case 5: return Integer.MIN_VALUE; default: return 0; } } }
class N10 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.i == 5) { int k = a.j; if (k > 3) foo(); return Integer.MIN_VALUE; } return 0; } }
class N11 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.i == 5) { if (a.j == 0) foo(); return Integer.MIN_VALUE; } return 0; } }
class N12 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.i == 5) { if (a.j != b.j) foo(); return Integer.MIN_VALUE; } return 0; } }
class N13 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.i == 5) { a.i = 0; return Integer.MIN_VALUE; } return 0; } }
class N14 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.i == 5) { a.j = 0; return Integer.MIN_VALUE; } return 0; } }
class N15 implements Comparator<V> { void foo() {} public int compare(V a, V b) { while (a.i == 5) { return Integer.MIN_VALUE; } return 0; } }
class N16 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.c == 'x') return Integer.MIN_VALUE; return 0; } }
class N17 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.i == 5) return Integer.MIN_VALUE + 1 - 1; return 0; } }
class N18 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (5 == a.i) return Integer.MIN_VALUE; return 0; } }
class N19 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (0 == a.i) return Integer.MIN_VALUE; return 0; } }
class N20 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (0 < a.i) return Integer.MIN_VALUE; return 0; } }
class N21 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.i == 5) { int r = Integer.MIN_VALUE; return r; } return 0; } }
class N22 implements Comparator<V> { void foo() {} public int compare(V a, V b) { int r = 0; if (a.i == 5) r = Integer.MIN_VALUE; return r; } }
class N23 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.i == 5) foo(); else return Integer.MIN_VALUE; return 0; } }
class N24 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.i == 5) { try { foo(); } catch (RuntimeException e) { } return Integer.MIN_VALUE; } return 0; } }
class N25 implements Comparator<V> { void foo() {} public int compare(V a, V b) { if (a.i == 5) { for (int k = 0; k < 3; k++) foo(); return Integer.MIN_VALUE; } return 0; } }
