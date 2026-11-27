package p;
class Z11 { int t;
 Z11(int x){
  try {
   if (x > 0) return;
   throw new RuntimeException();
  } catch (RuntimeException e) {
   t = 1;
  } finally {
   System.out.println(t);
  }
 }
}
