package e;

import android.app.Fragment;

public class F27InnerFragment {
    public class EnclosingClass {
        public class InnerFragment extends Fragment {
            public InnerFragment() {}
        }

        public Fragment create() {
            return new Fragment() {};
        }
    }

    public class OnlyInner {
        public class Inner {}
    }

    public class OnlyAnonymous {
        public Object create() {
            return new Object() {};
        }
    }
}
