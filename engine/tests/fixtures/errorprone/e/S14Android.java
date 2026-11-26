package e;

import android.app.Activity;
import android.app.Fragment;
import android.app.Service;
import android.content.Context;
import android.os.Bundle;
import dagger.android.AndroidInjection;
import dagger.android.support.AndroidSupportInjection;

final class S14Android {
  public class WrongOrder extends Activity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
      super.onCreate(savedInstanceState);
      AndroidInjection.inject(this);
    }
  }

  public class StatementsInBetween extends Activity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
      super.onCreate(savedInstanceState);
      System.out.println("hello, world");
      AndroidInjection.inject(this);
    }
  }

  public static class BaseActivity extends Activity {}

  public class ExtendsBase extends BaseActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
      super.onCreate(savedInstanceState);
      AndroidInjection.inject(this);
    }
  }

  public class WrongOrderFragmentPreApi23 extends Fragment {
    @Override
    public void onAttach(Activity activity) {
      super.onAttach(activity);
      AndroidInjection.inject(this);
    }
  }

  public class WrongOrderFragment extends Fragment {
    @Override
    public void onAttach(Context context) {
      super.onAttach(context);
      AndroidInjection.inject(this);
    }
  }

  public class WrongOrderService extends Service {
    @Override
    public void onCreate() {
      super.onCreate();
      AndroidInjection.inject(this);
    }
  }

  public class WrongOrderSupportFragment extends android.support.v4.app.Fragment {
    @Override
    public void onAttach(Context context) {
      super.onAttach(context);
      AndroidSupportInjection.inject(this);
    }
  }

  public class WrongOrderSupportFragmentPre23 extends android.support.v4.app.Fragment {
    @Override
    public void onAttach(Activity activity) {
      super.onAttach(activity);
      AndroidSupportInjection.inject(this);
    }
  }

  public class RightOrder extends Activity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
      AndroidInjection.inject(this);
      super.onCreate(savedInstanceState);
    }
  }

  public class RightOrderFragment extends Fragment {
    @Override
    public void onAttach(Context context) {
      AndroidInjection.inject(this);
      super.onAttach(context);
    }
  }

  public class RightOrderSupport extends android.support.v4.app.Fragment {
    @Override
    public void onAttach(Context context) {
      AndroidSupportInjection.inject(this);
      super.onAttach(context);
    }
  }

  public class NoSuper extends Activity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
      AndroidInjection.inject(this);
    }
  }

  public class NoInject extends Activity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
      super.onCreate(savedInstanceState);
    }
  }

  public class WrongInjector extends android.support.v4.app.Fragment {
    @Override
    public void onAttach(Context context) {
      super.onAttach(context);
      AndroidInjection.inject(new Activity());
    }
  }

  public class Nested extends Activity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
      super.onCreate(savedInstanceState);
      if (savedInstanceState == null) {
        AndroidInjection.inject(this);
      }
      Runnable r = () -> AndroidInjection.inject(this);
    }
  }

  public class OtherReceiver extends Activity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
      this.onCreate(savedInstanceState);
      AndroidInjection.inject(this);
    }
  }

  public class WithOtherMethod extends Activity {
    public void onCreate(Bundle savedInstanceState, int extra) {
      super.onCreate(savedInstanceState);
      AndroidInjection.inject(this);
    }
  }

  public class Suppressed extends Activity {
    @Override
    @SuppressWarnings("AndroidInjectionBeforeSuper")
    public void onCreate(Bundle savedInstanceState) {
      super.onCreate(savedInstanceState);
      AndroidInjection.inject(this);
    }
  }

  public class Twice extends Activity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
      super.onCreate(savedInstanceState);
      AndroidInjection.inject(this);
      AndroidInjection.inject(this);
    }
  }
}
