import java.lang.ref.Reference;

class S38ReachabilityFenceUsage3 {
  public void run() {
    try {
    } finally {
      Reference.reachabilityFence(this);
    }
  }
}
