package e;

class S9BadShift {
  void foo() {
    int x = 0;
    long result = 0;
    result += x >> 32;
    result += x << 32;
    result += x >>> 32;
    result += x >> 40;
    result += (x & 255) >> 40;
    result += 1 << 48;
    result += x >> 100;
    result += x >> -1;
    result += x >> 31;
    result += x >> 0;
    result += x >> 63;
    result += x >> 64;
    byte b = 0;
    char c = 'a';
    short s = 0;
    result += b >> 32;
    result += b << 32;
    result += c >> 32;
    result += c >>> 32;
    result += s << 33;
    long l = 0;
    result += l >> 32;
    result += l << 64;
    result += x >> 32L;
    result += x >> x;
    Integer boxed = 0;
    result += boxed >> 32;
    result += 1L << 48;
    result += 5 >>> 70;
    result += 'a' << 35;
    final int constant = 40;
    result += x >> constant;
  }

  @SuppressWarnings("BadShiftAmount")
  int suppressed(int x) {
    return x >> 32;
  }
}
