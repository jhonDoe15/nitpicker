package android.os;

public interface PowerManager {
  class WakeLock {
    public void acquire() {}

    public void acquire(int timeout) {}

    public boolean isHeld() {
      return true;
    }

    public void release() {}

    public void setReferenceCounted(boolean referenceCounted) {}
  }
}
