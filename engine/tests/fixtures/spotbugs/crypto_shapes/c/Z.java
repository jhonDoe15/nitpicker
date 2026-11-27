package c;
public class Z {
  void a() { org.owasp.esapi.ESAPI.encryptor(); }
  void b(org.owasp.esapi.Encryptor e) throws Exception { e.hash("a","b"); }
  void c(org.owasp.esapi.Encryptor e) throws Exception { e.seal("a", 1L); }
  void d() { new com.hazelcast.config.SymmetricEncryptionConfig(); }
  void e(com.hazelcast.config.SymmetricEncryptionConfig c) { c.setAlgorithm("AES"); }
  void f() { new com.hazelcast.config.NetworkConfig().getSymmetricEncryptionConfig(); }
}
