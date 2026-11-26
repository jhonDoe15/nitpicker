class S20Constants {
  static final boolean DEBUG = true;
  static final int MASK = 0x0F;

  double negativeZeros() {
    double d = -0;
    float f = -0;
    double e = -0L;
    double ok = -0.0;
    double ok2 = -1;
    int i = -0;
    long l = -0L;
    char c = (char) -0;
    double viaCall = Math.abs(-0);
    f = -0;
    d = -0 + 1.0;
    return -0;
  }

  float floatReturn() {
    return -0;
  }

  @SuppressWarnings("AttemptedNegativeZero")
  double suppressed() {
    return -0;
  }

  int bitwise() {
    int a = 1 & 2;
    int b = 0 & 1;
    int c = MASK & 0xF0;
    long d = 1L & 2L;
    int e = (1) & (2);
    int f = 3 & 1;
    int g = MASK & 0x0F;
    boolean h = true & false;
    return a + b + c + e + f + g;
  }

  @SuppressWarnings("ErroneousBitwiseExpression")
  int bitwiseSuppressed() {
    return 1 & 2;
  }

  boolean complex(boolean x) {
    boolean a = 1 == 1;
    boolean b = x && false;
    boolean c = x || true;
    boolean d = true && x;
    boolean e = false || x;
    boolean f = !false && !true;
    boolean g = "a" == "b";
    boolean h = DEBUG || false;
    boolean i = true | false;
    boolean j = (true) || x;
    boolean k = x & false;
    boolean l = x | true;
    boolean m = 1 < 2 && x;
    boolean n = x && !true;
    boolean o = !true || !false;
    boolean p = 2 > 3;
    boolean q = x == true;
    boolean r = true != false;
    return a || b || c || d || e || f || g || h || i || j || k || l || m || n || o || p || q || r;
  }

  @SuppressWarnings("ComplexBooleanConstant")
  boolean complexSuppressed() {
    return 1 == 1;
  }

  void narrowing() {
    short s = 0;
    char t = 0;
    byte u = 0;
    float v = 0;
    s *= 1;
    t *= 1;
    u *= 1;
    u *= 1L;
    v *= 1.0;
    v *= 1.0d;
    s /= 1;
    s %= 1;
    s += 1;
    s -= 1;
    s <<= 1;
    s >>= 1;
    s >>>= 1;
    for (short i = -1; i != 0; i >>>= 1) ;
    int si = 0;
    long sl = 0;
    double sd = 0;
    si *= 1;
    sl *= 1;
    sd *= 1;
    float a = 0;
    float b = 0;
    Float c = Float.valueOf(0);
    a += b;
    a += c;
    f(s, u);
  }

  static final byte FLAG = 1;

  void conditionals(byte m, boolean on, int i, char c) {
    m |= on ? FLAG : 0;
    m |= (on ? FLAG : 0);
    m |= on ? FLAG : 300;
    m |= on ? FLAG : i;
    m += on ? (on ? FLAG : 1) : 2;
    c |= on ? 'a' : 0;
    c |= on ? 'a' : -1;
  }

  void f(short s, byte b) {
    short smask = 0b1;
    byte bmask = 0b1;
    s &= smask;
    s |= smask;
    s ^= smask;
    s &= bmask;
    s |= bmask;
    s ^= bmask;
    b &= bmask;
    b |= bmask;
    b ^= bmask;
    s &= ~1;
    s |= 1;
    s ^= 1;
    b &= ~1;
    b |= 1;
    b ^= 1;
    b |= 128;
    b &= 128;
    b ^= 128;
    b |= 1L;
    b &= 1L;
    b ^= 1L;
    b |= 256;
    b &= ~256;
    b ^= 256;
    s += smask;
    s -= smask;
    s *= smask;
    s += bmask;
    s -= bmask;
    s *= bmask;
    b -= bmask;
    b += bmask;
    b /= bmask;
  }

  void precedence(boolean cond) {
    float f = 0;
    f -= 3.0 - 2.0;
    f -= 3.0 * 2.0;
    f -= 3.0 > 0 ? 1.0 : 2.0;
    f += (1.0 + 2.0);
    f *= 2.0 + 3;
    f /= cond ? 1.0 : 2.0;
    int i = 0;
    i += 1.5;
    i += 2L * 3;
    i += cond ? 1L : 2L;
    i <<= 2L;
    Long boxed = 5L;
    i += boxed;
    Integer j = 0;
    j += 1;
    char c = 'a';
    c += 1;
    c += 1.0;
    short sh = 1;
    sh += c;
  }

  @SuppressWarnings("NarrowingCompoundAssignment")
  void narrowingSuppressed() {
    short s = 0;
    s += 1.0;
  }
}
