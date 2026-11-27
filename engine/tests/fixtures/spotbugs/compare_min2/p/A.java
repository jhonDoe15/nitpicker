package p;
import java.util.*;
class V { int i; int j; }
class M_eq_c5_t implements Comparator<V> { public int compare(V a, V b) { if (a.i == 5) return Integer.MIN_VALUE; return 0; } }
class M_eq_c5_f implements Comparator<V> { public int compare(V a, V b) { if (a.i == 5) return 0; return Integer.MIN_VALUE; } }
class M_eq_cm_t implements Comparator<V> { public int compare(V a, V b) { if (a.i == -1) return Integer.MIN_VALUE; return 0; } }
class M_eq_cm_f implements Comparator<V> { public int compare(V a, V b) { if (a.i == -1) return 0; return Integer.MIN_VALUE; } }
class M_eq_c2_t implements Comparator<V> { public int compare(V a, V b) { if (a.i == 2) return Integer.MIN_VALUE; return 0; } }
class M_eq_c2_f implements Comparator<V> { public int compare(V a, V b) { if (a.i == 2) return 0; return Integer.MIN_VALUE; } }
class M_eq_sw_t implements Comparator<V> { public int compare(V a, V b) { if (b.i == a.i) return Integer.MIN_VALUE; return 0; } }
class M_eq_sw_f implements Comparator<V> { public int compare(V a, V b) { if (b.i == a.i) return 0; return Integer.MIN_VALUE; } }
class M_eq_cl_t implements Comparator<V> { public int compare(V a, V b) { int x = b.i; if (a.i == x) return Integer.MIN_VALUE; return 0; } }
class M_eq_cl_f implements Comparator<V> { public int compare(V a, V b) { int x = b.i; if (a.i == x) return 0; return Integer.MIN_VALUE; } }
class M_eq_fld_t implements Comparator<V> { public int compare(V a, V b) { if (a.i == a.j) return Integer.MIN_VALUE; return 0; } }
class M_eq_fld_f implements Comparator<V> { public int compare(V a, V b) { if (a.i == a.j) return 0; return Integer.MIN_VALUE; } }
class M_ne_c5_t implements Comparator<V> { public int compare(V a, V b) { if (a.i != 5) return Integer.MIN_VALUE; return 0; } }
class M_ne_c5_f implements Comparator<V> { public int compare(V a, V b) { if (a.i != 5) return 0; return Integer.MIN_VALUE; } }
class M_ne_cm_t implements Comparator<V> { public int compare(V a, V b) { if (a.i != -1) return Integer.MIN_VALUE; return 0; } }
class M_ne_cm_f implements Comparator<V> { public int compare(V a, V b) { if (a.i != -1) return 0; return Integer.MIN_VALUE; } }
class M_ne_c2_t implements Comparator<V> { public int compare(V a, V b) { if (a.i != 2) return Integer.MIN_VALUE; return 0; } }
class M_ne_c2_f implements Comparator<V> { public int compare(V a, V b) { if (a.i != 2) return 0; return Integer.MIN_VALUE; } }
class M_ne_sw_t implements Comparator<V> { public int compare(V a, V b) { if (b.i != a.i) return Integer.MIN_VALUE; return 0; } }
class M_ne_sw_f implements Comparator<V> { public int compare(V a, V b) { if (b.i != a.i) return 0; return Integer.MIN_VALUE; } }
class M_ne_cl_t implements Comparator<V> { public int compare(V a, V b) { int x = b.i; if (a.i != x) return Integer.MIN_VALUE; return 0; } }
class M_ne_cl_f implements Comparator<V> { public int compare(V a, V b) { int x = b.i; if (a.i != x) return 0; return Integer.MIN_VALUE; } }
class M_ne_fld_t implements Comparator<V> { public int compare(V a, V b) { if (a.i != a.j) return Integer.MIN_VALUE; return 0; } }
class M_ne_fld_f implements Comparator<V> { public int compare(V a, V b) { if (a.i != a.j) return 0; return Integer.MIN_VALUE; } }
class M_lt_c5_t implements Comparator<V> { public int compare(V a, V b) { if (a.i < 5) return Integer.MIN_VALUE; return 0; } }
class M_lt_c5_f implements Comparator<V> { public int compare(V a, V b) { if (a.i < 5) return 0; return Integer.MIN_VALUE; } }
class M_lt_cm_t implements Comparator<V> { public int compare(V a, V b) { if (a.i < -1) return Integer.MIN_VALUE; return 0; } }
class M_lt_cm_f implements Comparator<V> { public int compare(V a, V b) { if (a.i < -1) return 0; return Integer.MIN_VALUE; } }
class M_lt_c2_t implements Comparator<V> { public int compare(V a, V b) { if (a.i < 2) return Integer.MIN_VALUE; return 0; } }
class M_lt_c2_f implements Comparator<V> { public int compare(V a, V b) { if (a.i < 2) return 0; return Integer.MIN_VALUE; } }
class M_lt_sw_t implements Comparator<V> { public int compare(V a, V b) { if (b.i < a.i) return Integer.MIN_VALUE; return 0; } }
class M_lt_sw_f implements Comparator<V> { public int compare(V a, V b) { if (b.i < a.i) return 0; return Integer.MIN_VALUE; } }
class M_lt_cl_t implements Comparator<V> { public int compare(V a, V b) { int x = b.i; if (a.i < x) return Integer.MIN_VALUE; return 0; } }
class M_lt_cl_f implements Comparator<V> { public int compare(V a, V b) { int x = b.i; if (a.i < x) return 0; return Integer.MIN_VALUE; } }
class M_lt_fld_t implements Comparator<V> { public int compare(V a, V b) { if (a.i < a.j) return Integer.MIN_VALUE; return 0; } }
class M_lt_fld_f implements Comparator<V> { public int compare(V a, V b) { if (a.i < a.j) return 0; return Integer.MIN_VALUE; } }
class M_le_c5_t implements Comparator<V> { public int compare(V a, V b) { if (a.i <= 5) return Integer.MIN_VALUE; return 0; } }
class M_le_c5_f implements Comparator<V> { public int compare(V a, V b) { if (a.i <= 5) return 0; return Integer.MIN_VALUE; } }
class M_le_cm_t implements Comparator<V> { public int compare(V a, V b) { if (a.i <= -1) return Integer.MIN_VALUE; return 0; } }
class M_le_cm_f implements Comparator<V> { public int compare(V a, V b) { if (a.i <= -1) return 0; return Integer.MIN_VALUE; } }
class M_le_c2_t implements Comparator<V> { public int compare(V a, V b) { if (a.i <= 2) return Integer.MIN_VALUE; return 0; } }
class M_le_c2_f implements Comparator<V> { public int compare(V a, V b) { if (a.i <= 2) return 0; return Integer.MIN_VALUE; } }
class M_le_sw_t implements Comparator<V> { public int compare(V a, V b) { if (b.i <= a.i) return Integer.MIN_VALUE; return 0; } }
class M_le_sw_f implements Comparator<V> { public int compare(V a, V b) { if (b.i <= a.i) return 0; return Integer.MIN_VALUE; } }
class M_le_cl_t implements Comparator<V> { public int compare(V a, V b) { int x = b.i; if (a.i <= x) return Integer.MIN_VALUE; return 0; } }
class M_le_cl_f implements Comparator<V> { public int compare(V a, V b) { int x = b.i; if (a.i <= x) return 0; return Integer.MIN_VALUE; } }
class M_le_fld_t implements Comparator<V> { public int compare(V a, V b) { if (a.i <= a.j) return Integer.MIN_VALUE; return 0; } }
class M_le_fld_f implements Comparator<V> { public int compare(V a, V b) { if (a.i <= a.j) return 0; return Integer.MIN_VALUE; } }
class M_gt_c5_t implements Comparator<V> { public int compare(V a, V b) { if (a.i > 5) return Integer.MIN_VALUE; return 0; } }
class M_gt_c5_f implements Comparator<V> { public int compare(V a, V b) { if (a.i > 5) return 0; return Integer.MIN_VALUE; } }
class M_gt_cm_t implements Comparator<V> { public int compare(V a, V b) { if (a.i > -1) return Integer.MIN_VALUE; return 0; } }
class M_gt_cm_f implements Comparator<V> { public int compare(V a, V b) { if (a.i > -1) return 0; return Integer.MIN_VALUE; } }
class M_gt_c2_t implements Comparator<V> { public int compare(V a, V b) { if (a.i > 2) return Integer.MIN_VALUE; return 0; } }
class M_gt_c2_f implements Comparator<V> { public int compare(V a, V b) { if (a.i > 2) return 0; return Integer.MIN_VALUE; } }
class M_gt_sw_t implements Comparator<V> { public int compare(V a, V b) { if (b.i > a.i) return Integer.MIN_VALUE; return 0; } }
class M_gt_sw_f implements Comparator<V> { public int compare(V a, V b) { if (b.i > a.i) return 0; return Integer.MIN_VALUE; } }
class M_gt_cl_t implements Comparator<V> { public int compare(V a, V b) { int x = b.i; if (a.i > x) return Integer.MIN_VALUE; return 0; } }
class M_gt_cl_f implements Comparator<V> { public int compare(V a, V b) { int x = b.i; if (a.i > x) return 0; return Integer.MIN_VALUE; } }
class M_gt_fld_t implements Comparator<V> { public int compare(V a, V b) { if (a.i > a.j) return Integer.MIN_VALUE; return 0; } }
class M_gt_fld_f implements Comparator<V> { public int compare(V a, V b) { if (a.i > a.j) return 0; return Integer.MIN_VALUE; } }
class M_ge_c5_t implements Comparator<V> { public int compare(V a, V b) { if (a.i >= 5) return Integer.MIN_VALUE; return 0; } }
class M_ge_c5_f implements Comparator<V> { public int compare(V a, V b) { if (a.i >= 5) return 0; return Integer.MIN_VALUE; } }
class M_ge_cm_t implements Comparator<V> { public int compare(V a, V b) { if (a.i >= -1) return Integer.MIN_VALUE; return 0; } }
class M_ge_cm_f implements Comparator<V> { public int compare(V a, V b) { if (a.i >= -1) return 0; return Integer.MIN_VALUE; } }
class M_ge_c2_t implements Comparator<V> { public int compare(V a, V b) { if (a.i >= 2) return Integer.MIN_VALUE; return 0; } }
class M_ge_c2_f implements Comparator<V> { public int compare(V a, V b) { if (a.i >= 2) return 0; return Integer.MIN_VALUE; } }
class M_ge_sw_t implements Comparator<V> { public int compare(V a, V b) { if (b.i >= a.i) return Integer.MIN_VALUE; return 0; } }
class M_ge_sw_f implements Comparator<V> { public int compare(V a, V b) { if (b.i >= a.i) return 0; return Integer.MIN_VALUE; } }
class M_ge_cl_t implements Comparator<V> { public int compare(V a, V b) { int x = b.i; if (a.i >= x) return Integer.MIN_VALUE; return 0; } }
class M_ge_cl_f implements Comparator<V> { public int compare(V a, V b) { int x = b.i; if (a.i >= x) return 0; return Integer.MIN_VALUE; } }
class M_ge_fld_t implements Comparator<V> { public int compare(V a, V b) { if (a.i >= a.j) return Integer.MIN_VALUE; return 0; } }
class M_ge_fld_f implements Comparator<V> { public int compare(V a, V b) { if (a.i >= a.j) return 0; return Integer.MIN_VALUE; } }
