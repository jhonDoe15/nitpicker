package e;

import android.support.annotation.CallSuper;
import com.google.errorprone.annotations.OverridingMethodsMustInvokeSuper;
import edu.umd.cs.findbugs.annotations.OverrideMustInvoke;

class S14SuperAndroid {
  @CallSuper
  public void doIt() {}

  @CallSuper
  public Object doThat() {
    return null;
  }
}

class S14SubAndroid extends S14SuperAndroid {
  @Override
  public void doIt() {}

  @Override
  public Object doThat() {
    return java.util.Objects.requireNonNull(super.doThat());
  }
}

class S14SubAndroidCalls extends S14SuperAndroid {
  @Override
  public void doIt() {
    super.doIt();
  }
}

class S14SuperAndroidX {
  @androidx.annotation.CallSuper
  public void doIt() {}
}

class S14SubAndroidX extends S14SuperAndroidX {
  @Override
  public void doIt() {}
}

class S14SuperJavax {
  @javax.annotation.OverridingMethodsMustInvokeSuper
  public void doIt() {}
}

class S14SubJavax extends S14SuperJavax {
  @Override
  public void doIt() {}
}

class S14SuperErrorProne {
  @OverridingMethodsMustInvokeSuper
  public void doIt() {}
}

class S14SubErrorProne extends S14SuperErrorProne {
  @Override
  public void doIt() {}

  @SuppressWarnings("MissingSuperCall")
  public void other() {}
}

class S14SuperFindBugs {
  @OverrideMustInvoke
  public void doIt() {}
}

class S14SubFindBugs extends S14SuperFindBugs {
  @Override
  public void doIt() {}
}

interface S14SuperInterface {
  @CallSuper
  default void doIt() {}
}

class S14SubInterface implements S14SuperInterface {
  @Override
  public void doIt() {
    S14SuperInterface.super.doIt();
  }
}

class S14SubInterfaceMissing implements S14SuperInterface {
  @Override
  public void doIt() {}
}

class S14SuperSuper {
  @javax.annotation.OverridingMethodsMustInvokeSuper
  public void doIt() {}
}

class S14SuperMid extends S14SuperSuper {}

class S14SubSub extends S14SuperMid {
  @Override
  public void doIt() {}
}

class S14SubLambda extends S14SuperAndroid {
  @Override
  public void doIt() {
    Runnable r = () -> super.doIt();
    Object o = new Object() {
      void inner() {
        S14SubLambda.super.doIt();
      }
    };
  }
}

class S14SubOuterSuper extends S14SuperAndroid {
  @Override
  public void doIt() {
    Runnable r = new Runnable() {
      public void run() {
        S14SubOuterSuper.super.doIt();
      }
    };
  }
}

abstract class S14AbstractClass {
  @CallSuper
  public abstract void bad();

  @CallSuper
  public void ok() {}

  @javax.annotation.OverridingMethodsMustInvokeSuper
  public abstract void badJavax();

  @OverrideMustInvoke
  public abstract void badFindBugs();

  @androidx.annotation.CallSuper
  public abstract void badAndroidX();

}

interface S14AbstractInterface {
  @CallSuper
  void bad();

  @CallSuper
  default void fine() {}
}
