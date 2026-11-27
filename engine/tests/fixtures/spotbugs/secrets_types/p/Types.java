package p;

class T1 {
  private static final String password = "x";
}

class T2 {
  private static String password = "x";
}

class T3 {
  private final String password = "x";
}

class T4 {
  private static final byte[] password = {1};
}

class T5 {
  private static final byte[] password = {1, 2};
}

class T6 {
  private static final byte[] password = "abc".getBytes();
}

class T7 {
  private static final char[] password = "abc".toCharArray();
}

class T8 {
  private static final char[] password = {'a', 'b'};
}

class T9 {
  private static final char[] password = {'a', 'b', 'c'};
}

class T10 {
  private static final char[] password = new char[3];
}

class T11 {
  private static final char[] password = new char[] {'a'};
}

class T12 {
  private static char[] password = {'a'};
}

class T13 {
  private final char[] password = {'a'};
}

class T14 {
  char[] password = {'a'};
}

class T15 {
  private static final int password = 5;
}

class T16 {
  private static final java.math.BigInteger password = java.math.BigInteger.ONE;
}

class T17 {
  private static final java.math.BigInteger password = new java.math.BigInteger("123");
}

class T18 {
  private static final java.math.BigInteger key = new java.math.BigInteger("123");
}

class T19 {
  private static final java.math.BigInteger key = java.math.BigInteger.valueOf(5L);
}

class T20 {
  private static final long[] password = {1L};
}

class T21 {
  private static final int[] password = {1};
}

class T22 {
  private static final Object[] password = {"a"};
}

class T23 {
  private static final String[] password = {"a"};
}

