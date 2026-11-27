package p;
class D7 { int v;
 D7(int x){ Object o = switch (x) { case 1 -> { int v = 3; yield v; } default -> 0; }; }
}
