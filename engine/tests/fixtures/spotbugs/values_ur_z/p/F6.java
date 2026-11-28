package p;
class F6 { int a;
 F6(int x){ System.out.println(F6.this.a); System.out.println(this.a); }
 F6(){ System.out.println(this.a); System.out.println(F6.this.a); }
}
