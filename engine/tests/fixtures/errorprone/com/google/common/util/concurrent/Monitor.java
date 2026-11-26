package com.google.common.util.concurrent;

public class Monitor {
  public void enter() {}

  public void leave() {}

  public abstract static class Guard {
    protected final Monitor monitor;

    protected Guard(Monitor monitor) {
      this.monitor = monitor;
    }

    public abstract boolean isSatisfied();
  }
}
