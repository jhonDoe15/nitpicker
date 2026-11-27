package p;
class Z9 { int t;
 Z9(int x){
  try {
   try { t = 1; } finally { }
   if (x > 0) return;
  } finally { System.out.println(t); }
 }
}
