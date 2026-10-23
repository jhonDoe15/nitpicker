package nitpicker.kotlinpsi.catches;

final class Flow {
  static final Flow STOPS = new Flow(false, false);
  static final Flow FALLS = new Flow(true, false);
  static final Flow LEAVES = new Flow(false, true);

  final boolean falls;
  final boolean leaves;

  Flow(boolean falls, boolean leaves) {
    this.falls = falls;
    this.leaves = leaves;
  }

  boolean completes() {
    return falls || leaves;
  }

  Flow or(Flow other) {
    return new Flow(falls || other.falls, leaves || other.leaves);
  }
}
