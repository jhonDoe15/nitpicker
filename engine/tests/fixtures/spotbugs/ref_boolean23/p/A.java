package p;
enum E1 {
    X { { boolean z = p == q; } },
    Y { boolean w = p != q; },
    Z { { boolean z = Boolean.TRUE == Boolean.valueOf(true); } },
    W { boolean g(Boolean a) { return p == a; } };
    final Boolean p = Boolean.TRUE, q = Boolean.FALSE;
    boolean g(Boolean a) { return false; }
}
enum E2 {
    A { { Boolean l = p; boolean z = l == q; } };
    Boolean p = Boolean.TRUE, q = Boolean.FALSE;
}
