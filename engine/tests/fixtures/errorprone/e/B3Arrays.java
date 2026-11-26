package e;

import java.util.List;

class B3Arrays {
  int a[];
  int[] b;
  int[] c[];
  int d[][];
  int e[], f;
  int g, h[];
  String[] i, j[];
  int k[] = {1};
  int[][] l[];
  List<String> m[];
  int  n [ ];
  int o[ ];
  int p /* c */ [];

  int method()[] {
    return null;
  }

  int[] okMethod() {
    return null;
  }

  int[] mixed()[] {
    return null;
  }

  void params(int x[], int[] y, int z[][], String... w) {
    int local[] = new int[1];
    int[] okLocal = new int[1];
    for (int q[] : z) {}
    for (int[] r : z) {}
    for (int s[] = null, t = 0; t < 1; t++) {}
  }

  @SuppressWarnings("MixedArrayDimensions")
  int suppressed[];

  public static final int[] PUB = {1, 2};
  public static final int[] EMPTY = {};
  public static final int[] EMPTY2 = new int[0];
  public static final int[] EMPTY3 = new int[] {};
  public static final int[] SIZED = new int[3];
  public static final int[][] SIZED2 = new int[0][5];
  public static final int[][] SIZED3 = new int[0][];
  public static final String[] NAMES = new String[] {"a"}, OTHER = new String[0];
  public static final int[] COMPUTED = compute();
  public static int[] notFinal = {1};
  public final int[] notStatic = {1};
  static final int[] notPublic = {1};
  private static final int[] priv = {1};
  public static final List<String> LIST = null;
  public static final int ZERO = 0;
  public static final int[] VIA_CONST = new int[ZERO];

  @SuppressWarnings("MutablePublicArray")
  public static final int[] SUPPRESSED = {1};

  static int[] compute() {
    return null;
  }

  interface Constants {
    int[] VALUES = {1, 2};
    int[] NONE = {};
  }
}
