package c;
import java.security.*;
public class O {
  static abstract class A extends MessageDigest { A() { super("x"); } }
  static class B extends MessageDigest { B() { super("x"); } protected void engineUpdate(byte b) {} protected void engineUpdate(byte[] b,int o,int l) {} protected byte[] engineDigest(){return null;} protected void engineReset(){} }
  static class S extends MessageDigestSpi { protected void engineUpdate(byte b) {} protected void engineUpdate(byte[] b,int o,int l) {} protected byte[] engineDigest(){return null;} protected void engineReset(){} }
  static class E extends B {}
  Object anon() { return new MessageDigest("y") { protected void engineUpdate(byte b) {} protected void engineUpdate(byte[] b,int o,int l) {} protected byte[] engineDigest(){return null;} protected void engineReset(){} }; }
  interface I {}
}
