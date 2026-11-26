package e;

class S12Record {
  record One(int d) {
    public One {
      int x = d();
    }
  }

  record This(int d) {
    public This {
      int x = this.d();
    }
  }

  record Normal(int d) {
    public Normal(int d) {
      this.d = d;
      int x = d();
    }
  }

  record Other(int d) {
    public Other {
      Other other = new Other(1);
      int x = other.d();
    }
  }

  record NonAccessor(int d) {
    public NonAccessor {
      foo();
    }

    void foo() {}
  }

  record Parameter(int d) {
    public Parameter {
      int x = d;
    }
  }

  static class Regular {
    private final int d;

    Regular(int d) {
      this.d = d;
      int x = d();
    }

    int d() {
      return d;
    }
  }

  record InLambda(int d) {
    public InLambda {
      Runnable r =
          () -> {
            int x = d();
          };
    }
  }

  record InAnonymous(int d) {
    public InAnonymous {
      var r =
          new Runnable() {
            @Override
            public void run() {
              int x = d();
            }
          };
    }
  }

  record Several(int a, String b, double c) {
    public Several {
      int x = a();
      String y = b();
      double z = this.c();
    }
  }

  record Custom(int d) {
    public Custom {
      int x = d();
    }

    @Override
    public int d() {
      return d;
    }
  }

  record Outer(int d) {
    public Outer {
      int x = d;
    }

    record Inner(int e) {
      public Inner {
        Outer o = new Outer(1);
        int x = o.d();
        int y = e();
      }
    }
  }

  record Overload(int d) {
    public Overload {
      int x = d(1);
    }

    int d(int other) {
      return other;
    }
  }

  record Suppressed(int d) {
    @SuppressWarnings("RecordAccessorInCompactConstructor")
    public Suppressed {
      int x = d();
    }
  }

  record Nested(int d) {
    public Nested {
      if (d < 0) {
        int x = d() + 1;
      }
      foo(d());
    }

    static void foo(int x) {}
  }

  record Generic<T>(T d) {
    public Generic {
      Object x = d();
    }
  }
}
