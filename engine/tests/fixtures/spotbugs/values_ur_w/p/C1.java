package p;
class C1 { int a; int b = a;
 C1(int x){ }
 C1(){
  // delegate
  this(1);
 }
}
