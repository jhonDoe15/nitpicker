package ruse;

import rlib.Gate;

class Uses {
  void calls(Gate gate, Gate.Wide wide) {
    new Gate();
    gate.open();
    wide.open();
    wide.knock();
    Gate.probe();
    Runnable r = gate::open;
    new Gate() {};
  }

  @Gate.Ok
  void allowed(Gate gate) {
    new Gate();
    gate.open();
    wide(gate);
  }

  @Gate.Loud
  void loud(Gate gate) {
    new Gate();
    gate.open();
  }

  void wide(Gate gate) {}

  @Gate.Loud
  static class LoudParent {}

  static class LoudChild extends LoudParent {
    Object made = new Gate();
  }

  static class Sub extends Gate {
    Sub() {}

    @Gate.Ok
    Sub(int value) {}
  }
}
