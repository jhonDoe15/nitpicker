import android.app.Fragment;
import android.preference.PreferenceActivity;

public class S22Android {
  static class PrivateFragment extends Fragment {
    public PrivateFragment() {}
  }

  static class PrivateV4Fragment extends android.support.v4.app.Fragment {
    public PrivateV4Fragment() {}
  }

  public static class PrivateConstructor extends Fragment {
    PrivateConstructor() {}
  }

  public static class NoConstructor extends Fragment {
    public NoConstructor(int x) {}
  }

  public static class NoConstructorV4 extends android.support.v4.app.Fragment {
    public NoConstructorV4(int x) {}
  }

  public static class ParentFragment extends Fragment {
    public ParentFragment() {}
  }

  public static class DerivedFragmentNoConstructor extends ParentFragment {
    public DerivedFragmentNoConstructor(int x) {}
  }

  public static class EnclosingClass {
    public class InnerFragment extends Fragment {
      public InnerFragment() {}
    }

    public Fragment create1() {
      return new Fragment() {};
    }

    public Fragment create2() {
      class LocalFragment extends Fragment {}
      return new LocalFragment();
    }
  }

  public static class NotAFragment1 {
    public NotAFragment1(int x) {}
  }

  private static class NotAFragment3 {}

  private abstract class AbstractFragment extends Fragment {
    public AbstractFragment(int x) {}
  }

  public static class MyFragment extends Fragment {
    private int a;
  }

  public static class DerivedFragment extends MyFragment {}

  public static class MyFragment2 extends Fragment {
    public MyFragment2() {}

    public MyFragment2(int x) {}
  }

  public static class StaticEnclosing {
    public static class InnerFragment extends Fragment {
      public InnerFragment() {}
    }
  }

  interface AnInterface {
    public class ImplicitlyStaticInnerFragment extends Fragment {}

    class ImplicitlyStaticAndPublicInnerFragment extends Fragment {}
  }

  @SuppressWarnings("FragmentNotInstantiable")
  static class SuppressedFragment extends Fragment {}

  public static class SuppressedConstructor extends Fragment {
    @SuppressWarnings("FragmentNotInstantiable")
    SuppressedConstructor() {}
  }

  static class NoImplementation extends PreferenceActivity {}

  abstract static class AbstractNoImplementation extends PreferenceActivity {}

  static class DifferentSignature extends PreferenceActivity {
    protected boolean isValidFragment(String fragment, String unused) {
      return true;
    }
  }

  static class TriviallyTrue extends PreferenceActivity {
    protected boolean isValidFragment(String fragment) {
      return true;
    }
  }

  static class ConstantField extends PreferenceActivity {
    static final boolean KNOWN = true;

    protected boolean isValidFragment(String fragment) {
      return KNOWN;
    }
  }

  static class FoldedConstant extends PreferenceActivity {
    protected boolean isValidFragment(String fragment) {
      return !false && 1 == 1;
    }
  }

  static class ReturnsFalse extends PreferenceActivity {
    protected boolean isValidFragment(String fragment) {
      return false;
    }
  }

  static class BoxedTrue extends PreferenceActivity {
    protected boolean isValidFragment(String fragment) {
      return Boolean.valueOf(true);
    }
  }

  static class Variable extends PreferenceActivity {
    boolean unknown;

    protected boolean isValidFragment(String fragment) {
      return unknown;
    }
  }

  static class FullyImplemented extends PreferenceActivity {
    protected boolean isValidFragment(String fragment) {
      if ("VALID_FRAGMENT".equals(fragment)) {
        return true;
      }
      return false;
    }
  }

  static class OnSuperClass extends FullyImplemented {}

  abstract static class AbstractSuper extends PreferenceActivity {
    protected boolean isValidFragment(String fragment) {
      return fragment != null;
    }
  }

  static class OnAbstractSuper extends AbstractSuper {}

  static class AlwaysThrows extends PreferenceActivity {
    protected boolean isValidFragment(String fragment) {
      throw new IllegalStateException();
    }
  }

  static class LambdaReturns extends PreferenceActivity {
    protected boolean isValidFragment(String fragment) {
      java.util.function.Supplier<Boolean> supplier = () -> {
        return false;
      };
      return true;
    }
  }

  static class NotAnActivity {
    protected boolean isValidFragment(String fragment) {
      return true;
    }
  }

  void anonymous() {
    Object o = new PreferenceActivity() {};
    Object p =
        new PreferenceActivity() {
          @Override
          protected boolean isValidFragment(String className) {
            return true;
          }
        };
  }

  @SuppressWarnings("FragmentInjection")
  static class SuppressedActivity extends PreferenceActivity {}
}
