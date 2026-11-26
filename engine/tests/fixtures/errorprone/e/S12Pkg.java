package e;

public class S12Pkg {
  String pkg = "";
  protected String prot = "";
  private String priv = "";
  public String pub = "";

  static class Direct extends S12Pkg {}

  static class ViaOther extends s12base.Mid {}

  static class Hider extends S12Pkg {
    String pub = "";
  }

  interface Face {}

  void directPackage() {
    Direct d = null;
    pkg.equals(pkg);
  }

  void otherPackage() {
    ViaOther o = null;
    pkg.equals(pkg);
  }

  void otherProtected() {
    ViaOther o = null;
    prot.equals(prot);
  }

  void otherPublic() {
    ViaOther o = null;
    pub.equals(pub);
  }

  void directPrivate() {
    Direct d = null;
    priv.equals(priv);
  }

  void ownPrivate() {
    S12Pkg d = null;
    priv.equals(priv);
  }

  void hidden() {
    Hider h = null;
    pub.equals(pub);
  }

  void hiddenProtected() {
    Hider h = null;
    prot.equals(prot);
  }

  void otherThis() {
    ViaOther o = null;
    this.equals(this);
  }

  void directThis() {
    Direct d = null;
    this.equals(this);
  }

  void arrayType() {
    Direct[] d = null;
    pub.equals(pub);
  }

  void unrelated() {
    String s = "";
    pub.equals(pub);
  }

  void qualified(S12Pkg other) {
    Direct d = null;
    other.pub.equals(other.pub);
    other.pkg.equals(other.pkg);
  }
}
