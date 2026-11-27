package p;
class Z3 { int t;
 Z3(int x){
  try {
   if (x > 0) throw new RuntimeException();
   t = 1;
  } catch (RuntimeException e) {
   System.out.println(t);
  }
 }
}
