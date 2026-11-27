package p;
class B8 { int a; }
class F8 extends B8 { int a;
 F8(int x){ System.out.println(((B8)this).a); System.out.println(super.a); }
}
