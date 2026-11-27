package c;
import java.security.*;
public class O5 {
  Object a() {
    return new MessageDigest(
        "y") {
      int q = 1;
      protected void engineUpdate(byte b) {}
      protected void engineUpdate(byte[] b,int o,int l) {}
      protected byte[] engineDigest(){return null;}
      protected void engineReset(){}
    };
  }
  Object n = new javax.crypto.NullCipher();
  Object m = new
     javax.crypto.NullCipher();
  void t() throws Exception { javax.crypto.Cipher.getInstance("DESede"); javax.crypto.SecretKeyFactory.getInstance("DESede"); javax.crypto.KeyGenerator.getInstance("DESede"); }
  Runnable r = () -> {
    try {
      MessageDigest m = MessageDigest.getInstance("SHA-256");
      m.digest();
      Integer.toHexString(1);
    } catch (Exception e) { }
  };
  void e(org.owasp.esapi.Encryptor x) throws Exception {
    x
     .encrypt(
        null);
  }
}
class H8 {
  java.security.MessageDigest md;
  byte[] z = md.digest();
  String y = Integer.toHexString(1);
}
class H9 {
  void m(java.security.MessageDigest md) {
    Runnable r = () -> {
      md.digest();
      Integer.toHexString(2);
    };
    Runnable s = () -> Integer.toHexString(md.digest().length);
  }
}
