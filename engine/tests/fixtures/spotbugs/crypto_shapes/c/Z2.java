package c;
public class Z2 {
  void a(org.owasp.esapi.Encryptor e) throws Exception { e.encrypt(new org.owasp.esapi.crypto.PlainText("x")); }
  void b(org.owasp.esapi.Encryptor e, org.owasp.esapi.crypto.CipherText c) throws Exception { e.decrypt(c); }
  void c() throws Exception { org.owasp.esapi.ESAPI.encryptor().encrypt(new org.owasp.esapi.crypto.PlainText("x")); }
  void d() throws Exception { org.owasp.esapi.reference.crypto.JavaEncryptor.getInstance(); }
  void e(org.owasp.esapi.reference.crypto.JavaEncryptor j) throws Exception { j.encrypt(new org.owasp.esapi.crypto.PlainText("x")); }
  static class Sym extends com.hazelcast.config.SymmetricEncryptionConfig { }
  void f() { new Sym(); new com.hazelcast.config.SymmetricEncryptionConfig() {}; }
  void g(com.hazelcast.config.NetworkConfig n) { n.setSymmetricEncryptionConfig(null); }
  void h() { Object o = new com.hazelcast.config.SymmetricEncryptionConfig(); Object p = new com.hazelcast.config.SymmetricEncryptionConfig(); }
  void i() { Runnable r = () -> new com.hazelcast.config.SymmetricEncryptionConfig(); }
}
