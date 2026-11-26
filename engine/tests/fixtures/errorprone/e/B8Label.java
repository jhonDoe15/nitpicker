package e;

import java.util.List;

class B8Label {
  void loops(List<String> items) {
    outer:
    for (int i = 0; i < 3; i++) {
      break outer;
    }
    each:
    for (String s : items) {
      continue each;
    }
    loop:
    while (true) {
      break loop;
    }
    again:
    do {
      break again;
    } while (true);
  }

  void notLoops(boolean b) {
    block:
    {
      if (b) {
        break block;
      }
    }
    cond:
    if (b) {
      break cond;
    }
    sw:
    switch (1) {
      default:
        break sw;
    }
    expr:
    b = !b;
    sync:
    synchronized (this) {
      break sync;
    }
    tr:
    try {
      break tr;
    } finally {
    }
  }

  void nestedLabels() {
    a:
    b:
    for (;;) {
      break a;
    }
  }

  @SuppressWarnings("LabelledBreakTarget")
  void suppressed(boolean b) {
    block:
    {
      break block;
    }
  }

  void insideLambda(boolean b) {
    Runnable r = () -> {
      lambda:
      {
        if (b) {
          break lambda;
        }
      }
    };
  }
}
