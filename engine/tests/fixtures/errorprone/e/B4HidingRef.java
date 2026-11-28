package e;

import java.lang.ref.WeakReference;

public class B4HidingRef<T> extends WeakReference<T> {
  B4HidingRef(T t) {
    super(t);
  }

  B4HidingRef<T> next;
  Object queue;
  Object referent;
}
