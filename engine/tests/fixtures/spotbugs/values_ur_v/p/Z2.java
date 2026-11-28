package p;
class Z2 { int t;
 Z2(int x){
  try {
   t = 1;
   if (x > 0) return;
  } finally {
   System.out.println(t);
  }
 }
}
