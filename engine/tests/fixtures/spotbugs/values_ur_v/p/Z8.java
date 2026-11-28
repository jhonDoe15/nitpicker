package p;
class Z8 { int t;
 Z8(int x){
  try {
   try { if (x > 0) return; } finally { System.out.println(t); }
  } finally { t = 2; }
 }
}
