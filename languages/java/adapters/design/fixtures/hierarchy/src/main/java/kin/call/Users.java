package kin.call;

import kin.Pool;

public class Users {
  public void pooled() {
    try (Pool pool = new Pool()) {
      pool.acquire();
    }
  }

  public void leaked() {
    Pool pool = new Pool();
    pool.acquire();
  }

  public String lookup(Overloads.Store store) {
    return store.find(null);
  }

  public void print(Overloads.Printer printer) {
    printer.visit(null);
  }

  public void handle(Overloads.TextHandler handler) {
    handler.handle("text");
  }
}
