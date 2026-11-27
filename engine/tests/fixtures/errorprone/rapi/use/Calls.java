package rapi.use;

import rapi.Allow;
import rapi.Kept;
import rapi.Lib;
import rapi.Warn;

class Calls {
  Object field = new Lib();

  @Allow Object allowedField = new Lib();

  @Warn Object warnedField = new Lib();

  void plain(Lib lib, Lib.Sub sub) {
    lib.instance();
    sub.instance();
    sub.api();
    Lib.statics();
    Lib.pathed();
    Lib.named();
    Lib.relative();
    Lib.<String>same("x");
    Lib.same(1);
    Lib.many();
    Lib.many("a", "b");
    Lib.both();
    Lib.empty();
    lib.plain();
    new Lib();
    new Lib(1);
    new Lib("s");
    new Lib() {};
    new Lib(2) {};
    new Lib("t") {};
    lib.new Member();
    lib.new Member() {};
    Lib.accept(lib::api);
    Lib.accept(Lib::new);
    Lib.supply(Lib::new);
    Lib.supply(sub::instance);
    Lib.accept(Lib::statics);
    Lib.accept(Lib::pathed);
    Runnable r = () -> lib.instance();
    @Allow int local = lib.instance();
    @Warn int warned = lib.instance();
    int both = lib.instance() + Lib.statics();
    Lib.Sub.statics();
    Lib.accept(Lib.Sub::statics);
  }

  @Allow
  void allowed(Lib lib) {
    lib.instance();
    Lib.statics();
    new Lib();
    new Lib(1);
    new Lib() {};
    Lib.both();
    lib.api();
  }

  @Warn
  void warned(Lib lib) {
    lib.instance();
    new Lib();
    Lib.both();
  }

  @Allow.Nested
  void nested(Lib lib) {
    new Lib(1);
    lib.instance();
  }

  void inParameter(@Allow Lib lib) {
    lib.instance();
  }

  @Allow
  static class AllowedClass {
    void inside(Lib lib) {
      lib.instance();
      new Object() {
        void deeper() {
          new Lib();
        }
      };
    }
  }

  @Warn
  static class WarnedParent {}

  static class WarnedChild extends WarnedParent {
    void inside(Lib lib) {
      new Lib();
      lib.instance();
    }
  }

  @Allow
  static class AllowedParent {}

  static class AllowedChild extends AllowedParent {
    void inside(Lib lib) {
      lib.instance();
    }
  }

  static class Extends extends Lib {
    Extends() {}

    Extends(int value) {
      super(value);
    }

    @Allow
    Extends(long value) {}

    Extends(String value) {
      this();
    }
  }

  static class DefaultConstructor extends Lib {}

  void anonymousInterface() {
    new rapi.Lib.Sub() {
      @Override
      public void api() {}
    }.api();
  }
}

enum Choice {
  @Allow
  ONE {
    void f(Lib lib) {
      lib.instance();
    }
  },
  TWO {
    @Allow
    void f(Lib lib) {
      lib.instance();
    }
  };
}

@Kept
enum KeptEnum {
  A {
    void f() {
      Lib.inheritable();
    }
  };

  static class Inside {
    void f() {
      Lib.inheritable();
    }
  }
}

@Kept
class KeptParent {}

class KeptChild extends KeptParent {
  void f() {
    Lib.inheritable();
    new Object() {
      void g() {
        Lib.inheritable();
      }
    };
    Runnable r = () -> Lib.inheritable();
  }
}

class KeptUser {
  void f() {
    Lib.inheritable();
    new KeptParent() {
      void g() {
        Lib.inheritable();
      }
    };
    new KeptChild() {
      void g() {
        Lib.inheritable();
      }
    };
  }
}

interface KeptInterface {}

@Kept
interface KeptMarked {}

class KeptImplementer implements KeptMarked {
  void f() {
    Lib.inheritable();
    new KeptMarked() {
      void g() {
        Lib.inheritable();
      }
    };
  }
}
