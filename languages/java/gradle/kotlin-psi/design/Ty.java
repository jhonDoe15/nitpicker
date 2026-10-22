package nitpicker.kotlinpsi.design;

final class Ty {
  static final Ty UNKNOWN = new Ty(null, null);

  final Owner owner;
  final String text;

  private Ty(Owner owner, String text) {
    this.owner = owner;
    this.text = text;
  }

  static Ty of(Owner owner) {
    return owner == null ? UNKNOWN : new Ty(owner, null);
  }

  static Ty text(String text) {
    return text == null || text.isEmpty() ? UNKNOWN : new Ty(null, text);
  }

  boolean project() {
    return owner != null;
  }

  boolean known() {
    return owner != null || text != null;
  }

  String normalized() {
    if (owner != null) {
      return owner.listed ? owner.id : owner.name;
    }
    return text;
  }
}
