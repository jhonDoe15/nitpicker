package e;

import static java.util.Map.entry;

import com.google.common.base.Preconditions;
import com.google.common.base.Strings;
import com.google.common.base.Verify;
import com.google.common.flogger.FluentLogger;
import com.google.common.truth.StandardSubjectBuilder;
import com.google.common.truth.Subject;
import com.google.common.truth.Truth;
import java.security.KeyFactory;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.time.ZoneId;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;

class S13MapKeys {
  static final String FOO = "Foo";
  static final int ONE = 1;

  void keys(String dynamic) {
    Map<String, String> duplicate =
        Map.ofEntries(entry("Foo", "Bar"), entry("Ping", "Pong"), entry("Kit", "Kat"), entry("Foo", "Bar"));
    Map<String, String> distinct =
        Map.ofEntries(entry("Foo", "Bar"), entry("Ping", "Pong"), entry("Kit", "Kat"), entry("Food", "Bar"));
    Map<String, String> viaConstant = Map.ofEntries(entry(FOO, "a"), entry("Foo", "b"));
    Map<String, String> concatenated = Map.ofEntries(entry("Fo" + "o", "a"), entry(FOO, "b"));
    Map<Integer, String> ints = Map.ofEntries(entry(1, "a"), entry(2, "b"), entry(ONE, "c"));
    Map<Object, String> mixed = Map.ofEntries(entry(1, "a"), entry(1L, "b"), entry('a', "c"), entry("1", "d"), entry(true, "e"));
    Map<Object, String> chars = Map.ofEntries(entry('a', "a"), entry('b', "b"), entry('a', "c"));
    Map<Object, String> flags = Map.ofEntries(entry(true, "a"), entry(false, "b"), entry(true, "c"));
    Map<Object, String> doubles = Map.ofEntries(entry(1.5, "a"), entry(1.5f, "b"), entry(2.5, "c"), entry(2.5, "d"));
    Map<Object, String> floats = Map.ofEntries(entry(1.0f, "a"), entry(3.0e10f, "b"), entry(3.0e10f, "c"));
    Map<Object, String> longs = Map.ofEntries(entry(5L, "a"), entry(5L, "b"));
    Map<Object, String> small = Map.ofEntries(entry(0.0001, "a"), entry(0.0001, "b"));
    Map<String, String> unknown = Map.ofEntries(entry(dynamic, "a"), entry(dynamic, "b"));
    Map<String, String> three = Map.ofEntries(entry("a", "1"), entry("b", "2"), entry("b", "3"), entry("a", "4"));
    Map<String, String> single = Map.ofEntries(entry("a", "1"));
    Map<String, String> fromOf = Map.of("a", "1", "a", "2");
  }

  @SuppressWarnings("DuplicateMapKeys")
  void suppressed() {
    Map<String, String> duplicate = Map.ofEntries(entry("a", "1"), entry("a", "2"));
  }
}

class S13Crypto {
  static final String AES_STRING = "AES";
  static String transformation = "DES/CBC/NoPadding";

  void ciphers(String parameter) throws Exception {
    Cipher.getInstance("AES");
    Cipher.getInstance("RSA");
    Cipher.getInstance(AES_STRING);
    Cipher.getInstance("AES/ECB/NoPadding");
    Cipher.getInstance("DES/ECB/NoPadding");
    Cipher.getInstance("DES/ECB/NoPadding", "My Provider");
    Cipher.getInstance(transformation);
    Cipher.getInstance(parameter);
    Cipher.getInstance("AES/CBC/PKCS5Padding");
    Cipher.getInstance("RC4");
    Cipher.getInstance("RC4/ECB/NoPadding");
    Cipher.getInstance("ARCFOUR");
    Cipher.getInstance("ARC4/ECB/NoPadding");
    Cipher.getInstance("RSA/ECB/PKCS1Padding");
    Cipher.getInstance("AESWrap/ECB/NoPadding");
    Cipher.getInstance("RSA/NONE/OAEPPadding");
    Cipher.getInstance("ECIES");
    Cipher.getInstance("ECIES/NONE/NoPadding");
    Cipher.getInstance("DHIES/CBC/NoPadding");
    Cipher.getInstance("AES/\nCBC/NoPadding");
    Cipher.getInstance("AES/CBC/\r");
    Cipher.getInstance("RC4\n");
    Cipher.getInstance("AES/GCM/NoPadding" + "");
    Cipher.getInstance("");
    Cipher.getInstance("/");
    Cipher.getInstance("//");
    Cipher.getInstance("x/ECB/");
    Cipher.getInstance(S13Crypto.AES_STRING + "/ECB/PKCS5Padding");
  }

  @SuppressWarnings("InsecureCryptoUsage")
  void suppressed() throws Exception {
    Cipher.getInstance("AES");
  }

  void keys(String parameter) throws Exception {
    KeyPairGenerator.getInstance("DH");
    KeyPairGenerator.getInstance("DSA");
    KeyPairGenerator.getInstance("RSA");
    KeyPairGenerator.getInstance(parameter);
    KeyPairGenerator.getInstance("DH", "Provider");
    KeyFactory.getInstance("DH");
    KeyFactory.getInstance("DSA");
    KeyFactory.getInstance("EC");
    KeyFactory.getInstance(parameter);
    KeyAgreement.getInstance("DH");
    KeyAgreement.getInstance("ECDH");
    KeyAgreement.getInstance(parameter);
    KeyAgreement.getInstance("dh");
  }
}

class S13Substring {
  static final int ZERO = 0;
  static final long LONG_ZERO = 0;

  void substrings() {
    String x = "hello";
    String a = x.substring(0);
    String b = x.toLowerCase().substring(0);
    String c = x.substring(1);
    String d = x.substring(1, 3);
    String e = x.substring(0, 2);
    String f = x.toLowerCase().substring(1);
    String g = x.substring(ZERO);
    String h = x.substring(0 * 5);
    String i = x.substring((byte) 0);
    String j = x.substring('\0');
    String k = (x).substring(0);
    String l = x.substring(ZERO + 0);
    int unknown = 0;
    String m = x.substring(unknown);
    final int local = 0;
    String n = x.substring(local);
    String o = new StringBuilder("x").substring(0);
    CharSequence p = "abc";
    String q = p.subSequence(0, 1).toString();
    String r = x.concat("y").trim().substring(0);
  }

  @SuppressWarnings("SubstringOfZero")
  String suppressed(String x) {
    return x.substring(0);
  }
}

class S13Builders {
  void names(String dynamic) {
    Thread.Builder platform = Thread.ofPlatform();
    platform.name("worker-%d");
    platform.name("worker-%s", 0);
    platform.name("worker-", 0);
    platform.name("worker");
    platform.name(dynamic);
    Thread.ofPlatform().name("t-%d");
    Thread.ofPlatform().name("t-%s");
    Thread.ofPlatform().name("t-%x");
    Thread.ofVirtual().name("v-%d");
    Thread.ofVirtual().name("v-%s", 1);
    Thread.ofVirtual().name("v-" + "%d");
    Thread.ofVirtual().name("v-%%");
    Thread.currentThread().setName("thread-%d");
  }

  @SuppressWarnings("ThreadBuilderNameWithPlaceholder")
  void suppressed() {
    Thread.ofPlatform().name("t-%d");
  }
}

class S13Varargs {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();

  void log(String s, Object... a) {
    logger.atInfo().log(s, a);
  }

  void logObject(String s, Object a) {
    logger.atInfo().log(s, a);
  }

  void logNew() {
    logger.atInfo().log("foo", new Object[] {1});
  }

  void logConstantFormat(Object... a) {
    logger.atInfo().log("%s", a);
  }

  void logStringArray(String s, String[] a) {
    logger.atInfo().log(s, a);
  }

  Runnable inLambda(String s, Object... a) {
    return () -> logger.atInfo().log(s, a);
  }

  Runnable viaAnonymous(String s, Object... a) {
    return new Runnable() {
      @Override
      public void run() {
        logger.atInfo().log(s, a);
      }
    };
  }

  Object field = (Runnable) () -> logger.atInfo().log("x" + System.nanoTime(), new Object[0]);

  @SuppressWarnings("FloggerLogVarargs")
  void suppressed(String s, Object... a) {
    logger.atInfo().log(s, a);
  }
}

class S13Zone {
  static final String ZONE = "Z";

  void zones() {
    ZoneId nyc = ZoneId.of("America/New_York");
    ZoneId utc = ZoneId.of("Z");
    ZoneId lower = ZoneId.of("z");
    ZoneId constant = ZoneId.of(ZONE);
    ZoneId withMap = ZoneId.of("Z", ZoneId.SHORT_IDS);
    ZoneId qualified = java.time.ZoneId.of("Z");
    ZoneId offset = ZoneId.of("+01:00");
    ZoneId fromSystem = ZoneId.systemDefault();
    ZoneId concat = ZoneId.of("Z" + "");
  }

  @SuppressWarnings("ZoneIdOfZ")
  ZoneId suppressed() {
    return ZoneId.of("Z");
  }
}

class S13Lenient {
  private static final String FOO = "%s";

  void preconditions(Object x, Object y) {
    Preconditions.checkState(false, "%s");
    Preconditions.checkState(false, "%s", 1, 1);
    Preconditions.checkState(false, "expected %d = %d", 1, 1);
    Preconditions.checkState(false, FOO, 1, 1);
    Preconditions.checkState(false, "%s", 1);
    Preconditions.checkState(false);
    Preconditions.checkState(false, "no placeholders", 1);
    Preconditions.checkState(false, "%s %s", 1);
    Preconditions.checkState(false, "%d", 1, 2, 3);
    Preconditions.checkState(false, "it's %d\né", 1, 2);
    Preconditions.checkState(false, "%d %s %d", 1);
    Preconditions.checkState(false, "%s%s" + FOO, 1);
    Preconditions.checkArgument(x != null, "bad %d value", x, y);
    Preconditions.checkArgument(x != null, "%s and %s", x);
    Preconditions.checkNotNull(x, "%s");
    Preconditions.checkNotNull(x, "%s", y);
    Preconditions.checkNotNull(x, "%s", y, y);
    Preconditions.checkNotNull(x);
    Preconditions.checkElementIndex(1, 2, "%s %s");
    Preconditions.checkPositionIndex(1, 2, "%s %s");
    Preconditions.checkState(true, "text block %s", 1, 2);
    String dynamic = String.valueOf(x);
    Preconditions.checkState(false, dynamic, 1);
  }

  void others(Object x) {
    Verify.verify(x != null, "%s");
    Verify.verify(x != null, "%s", 1, 2);
    Verify.verifyNotNull(x, "%s %s", 1);
    String s = Strings.lenientFormat("%s");
    String t = Strings.lenientFormat("%s", 1, 2);
    String u = Strings.lenientFormat("fine %s", 1);
    StandardSubjectBuilder builder = Truth.assertWithMessage("%s");
    Truth.assertWithMessage("no args", 1);
    Truth.assertWithMessage("%s");
    Subject subject = Truth.assertThat(x);
    subject.check("%s", 1, 2);
    subject.check("%s");
    builder.withMessage("%s %s", 1);
    builder.withMessage("ok");
  }

  @SuppressWarnings("LenientFormatStringValidation")
  void suppressed() {
    Preconditions.checkState(false, "%s");
  }
}
