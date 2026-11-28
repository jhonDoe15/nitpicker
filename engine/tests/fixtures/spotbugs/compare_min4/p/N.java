package p;
import java.util.*;
class N_arr_ne_loc implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  int x=a[0], y=b[0]; if (x != y) return Integer.MIN_VALUE; return 0; } }
class N_arr_ne_direct implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  if (a[0] != b[0]) return Integer.MIN_VALUE; return 0; } }
class N_arr_gt5 implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  if (a[0] > 5) return Integer.MIN_VALUE; return 0; } }
class N_loc_gt5 implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  int x=a[0]; if (x > 5) return Integer.MIN_VALUE; return 0; } }
class N_fld_gt5 implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  if (f > 5) return Integer.MIN_VALUE; return 0; } }
class N_call_gt5 implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  if (g() > 5) return Integer.MIN_VALUE; return 0; } }
class N_len_gt5 implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  if (a.length > 5) return Integer.MIN_VALUE; return 0; } }
class N_len_ne implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  if (a.length != b.length) return Integer.MIN_VALUE; return 0; } }
class N_len_ne_f implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  if (a.length != b.length) return 0; return Integer.MIN_VALUE; } }
class N_loc_ne_f implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  int x=a[0], y=b[0]; if (x != y) return 0; return Integer.MIN_VALUE; } }
class N_param_gt5 implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  if (p > 5) return Integer.MIN_VALUE; return 0; } }
class N_param_ne_p implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  if (p != q) return Integer.MIN_VALUE; return 0; } }
class N_static_gt implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  if (S > 5) return Integer.MIN_VALUE; return 0; } }
class N_fld_ne_fld implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  if (f != h) return Integer.MIN_VALUE; return 0; } }
class N_thisf_ne_param implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  if (f != p) return Integer.MIN_VALUE; return 0; } }
class N_gt5_loc_f implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  int x=a[0]; if (x > 5) return 0; return Integer.MIN_VALUE; } }
class N_ge1_loc implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  int x=a[0]; if (x >= 1) return Integer.MIN_VALUE; return 0; } }
class N_lt_m1_loc implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  int x=a[0]; if (x < -1) return Integer.MIN_VALUE; return 0; } }
class N_neg_cond implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  int x=a[0]; if (!(x > 5)) return 0; return Integer.MIN_VALUE; } }
class N_zero_gt implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  int x=a[0]; if (0 > x) return Integer.MIN_VALUE; return 0; } }
class N_const_lt_x implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  int x=a[0]; if (5 < x) return Integer.MIN_VALUE; return 0; } }
class N_loopne implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  for (int i=0;i<a.length;i++) { if (a[i] != b[i]) return Integer.MIN_VALUE; } return 0; } }
class N_andg implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  int x=a[0]; if (x > 5 && b[0] == 0) return Integer.MIN_VALUE; return 0; } }
class N_boxed implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  Integer x=a[0]; if (x > 5) return Integer.MIN_VALUE; return 0; } }
class N_finally implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  try { if (a[0] != b[0]) return Integer.MIN_VALUE; return 0; } finally { a[0]++; } } }
class N_lambda_first implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  Comparator<int[]> c = (x, y) -> Integer.MIN_VALUE; return 0; } }
class N_staticconst implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  return LOW; } }
class N_staticconst_local implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  int r = LOW; return r; } }
class N_localmin_branch implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  int r = Integer.MIN_VALUE; if (a[0] > b[0]) r = 1; return r; } }
class N_ternary implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  return a[0] > b[0] ? Integer.MIN_VALUE : 1; } }
class N_ctor implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  return Integer.MIN_VALUE + 0; } }
class N_neg_max implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  return -Integer.MAX_VALUE - 1; } }
class N_short_min implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  return (int) Integer.MIN_VALUE; } }
class N_cond_assign implements Comparator<int[]> { int f, h; static int S; static final int LOW = Integer.MIN_VALUE; int g() { return 1; }
  public int compare(int[] a, int[] b) { int p = 1, q = 2;
  int x; if ((x = a[0]) != b[0]) return Integer.MIN_VALUE; return 0; } }
