package e;

import java.io.Externalizable;
import java.io.IOException;
import java.io.InputStream;
import java.io.ObjectInput;
import java.io.ObjectInputStream;
import java.io.Serializable;
import java.util.IdentityHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.HashMap;
import java.util.concurrent.Future;
import java.util.concurrent.FutureTask;

class B3Locale {
  void run(String language, String country) {
    Locale a = new Locale("en");
    Locale b = new Locale("en_US");
    Locale c = new Locale(language);
    Locale d = new Locale(language, country);
    Locale e = new Locale(language, country, "variant");
    Locale f = Locale.of("en_GB");
    Locale g = Locale.of(language);
    Locale h = Locale.of(language, country);
    Locale i = Locale.forLanguageTag("en-US");
    String s = a.toString();
    String t = Locale.getDefault().toString();
    String u = a.toLanguageTag();
    Object o = a;
    String v = o.toString();
  }

  @SuppressWarnings("UnsafeLocaleUsage")
  Locale suppressed() {
    return new Locale("fr");
  }

  Locale nested(String x) {
    return new Locale(x.trim() + "_" + x);
  }
}

class B3Serial implements Serializable {
  void read(ObjectInputStream in) throws Exception {
    Object a = in.readObject();
    in.defaultReadObject();
    in.readInt();
    in.readUTF();
  }

  private void readObject(ObjectInputStream in) throws IOException, ClassNotFoundException {
    in.defaultReadObject();
    Object x = in.readObject();
  }

  void callReadObject(ObjectInputStream in) throws Exception {
    readObject(in);
  }
}

class B3Stream extends ObjectInputStream {
  B3Stream(InputStream in) throws IOException {
    super(in);
  }

  @Override
  protected Object readObjectOverride() throws IOException, ClassNotFoundException {
    return super.readObjectOverride();
  }

  Object other() throws Exception {
    return readObject();
  }

  @Override
  protected Class<?> resolveClass(java.io.ObjectStreamClass desc) throws IOException, ClassNotFoundException {
    return super.resolveClass(desc);
  }
}

class B3Ext implements Externalizable {
  @Override
  public void writeExternal(java.io.ObjectOutput out) throws IOException {}

  @Override
  public void readExternal(ObjectInput in) throws IOException, ClassNotFoundException {
    Object o = in.readObject();
    new B3Ext().readExternal(in);
  }

  Object elsewhere(ObjectInput in) throws Exception {
    new B3Ext().readExternal(in);
    return in.readObject();
  }
}

class B3Interrupt {
  void run(Future<?> future, Thread thread, boolean flag) throws Exception {
    future.cancel(true);
    future.cancel(false);
    future.cancel(flag);
    future.cancel((false));
    thread.interrupt();
    Thread.currentThread().interrupt();
    Thread.currentThread().getName();
  }

  static final boolean NO = false;

  void more(Future<?> future) {
    future.cancel(NO);
    future.cancel(!true);
  }

  class Task extends FutureTask<String> {
    Task() {
      super(() -> "x");
    }

    @Override
    public boolean cancel(boolean mayInterruptIfRunning) {
      Future<?> other = this;
      other.cancel(mayInterruptIfRunning);
      return super.cancel(mayInterruptIfRunning);
    }

    void notCancel(boolean b) {
      cancel(b);
      interruptAll();
    }

    void interruptAll() {}
  }

  class Worker extends Thread {
    void go(Thread other) {
      interrupt();
      this.interrupt();
      other.interrupt();
    }
  }
}

class B3Identity {
  Map<String, String> field = new IdentityHashMap<>();
  IdentityHashMap<String, String> good = new IdentityHashMap<>();

  void run(Map<String, String> map, IdentityHashMap<String, String> id) {
    Map<String, String> a = new IdentityHashMap<>();
    Map<String, String> b = new IdentityHashMap<String, String>();
    IdentityHashMap<String, String> c = new IdentityHashMap<>();
    Object o = new IdentityHashMap<String, String>();
    id.equals(map);
    id.equals(id);
    id.putAll(map);
    id.putAll(id);
    IdentityHashMap<String, String> d = new IdentityHashMap<>(map);
    IdentityHashMap<String, String> e = new IdentityHashMap<>(id);
    IdentityHashMap<String, String> f = new IdentityHashMap<>(16);
    map = id;
    id = new IdentityHashMap<>();
    Map<String, String> g = new HashMap<>();
  }
}
