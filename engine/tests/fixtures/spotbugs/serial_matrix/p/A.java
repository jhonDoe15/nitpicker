package p;
import java.io.*;
import java.util.*;
abstract class AbsNoSer {} class B {} class Base implements Serializable {} interface SerIf extends Serializable {}
class Dir implements Serializable { 
  private Thread th;
  private Runnable ru;
  private Thread[] tha;
  private List<Thread> lth;
  private List<Runnable> lru;
  private Runnable[] rua;
  private AbsNoSer abs;
  private B bb;
  private java.lang.reflect.Method me;
}
class Ext extends Base { 
  private Thread th;
  private Runnable ru;
  private Thread[] tha;
  private List<Thread> lth;
  private List<Runnable> lru;
  private Runnable[] rua;
  private AbsNoSer abs;
  private B bb;
  private java.lang.reflect.Method me;
}
class Arr extends ArrayList<String> { 
  private Thread th;
  private Runnable ru;
  private Thread[] tha;
  private List<Thread> lth;
  private List<Runnable> lru;
  private Runnable[] rua;
  private AbsNoSer abs;
  private B bb;
  private java.lang.reflect.Method me;
}
class Ifc implements SerIf { 
  private Thread th;
  private Runnable ru;
  private Thread[] tha;
  private List<Thread> lth;
  private List<Runnable> lru;
  private Runnable[] rua;
  private AbsNoSer abs;
  private B bb;
  private java.lang.reflect.Method me;
}
class DirRo implements Serializable { private void readObject(ObjectInputStream s) throws IOException, ClassNotFoundException {}
  private Thread th;
  private Runnable ru;
  private Thread[] tha;
  private List<Thread> lth;
  private List<Runnable> lru;
  private Runnable[] rua;
  private AbsNoSer abs;
  private B bb;
  private java.lang.reflect.Method me;
}
class DirWo implements Serializable { private void writeObject(ObjectOutputStream s) throws IOException {}
  private Thread th;
  private Runnable ru;
  private Thread[] tha;
  private List<Thread> lth;
  private List<Runnable> lru;
  private Runnable[] rua;
  private AbsNoSer abs;
  private B bb;
  private java.lang.reflect.Method me;
}
class DirRr implements Serializable { private Object readResolve() { return this; }
  private Thread th;
  private Runnable ru;
  private Thread[] tha;
  private List<Thread> lth;
  private List<Runnable> lru;
  private Runnable[] rua;
  private AbsNoSer abs;
  private B bb;
  private java.lang.reflect.Method me;
}
class DirWr implements Serializable { private Object writeReplace() { return this; }
  private Thread th;
  private Runnable ru;
  private Thread[] tha;
  private List<Thread> lth;
  private List<Runnable> lru;
  private Runnable[] rua;
  private AbsNoSer abs;
  private B bb;
  private java.lang.reflect.Method me;
}
class ExtRo extends Base { private void readObject(ObjectInputStream s) throws IOException, ClassNotFoundException {}
  private Thread th;
  private Runnable ru;
  private Thread[] tha;
  private List<Thread> lth;
  private List<Runnable> lru;
  private Runnable[] rua;
  private AbsNoSer abs;
  private B bb;
  private java.lang.reflect.Method me;
}
class ExtWo extends Base { private void writeObject(ObjectOutputStream s) throws IOException {}
  private Thread th;
  private Runnable ru;
  private Thread[] tha;
  private List<Thread> lth;
  private List<Runnable> lru;
  private Runnable[] rua;
  private AbsNoSer abs;
  private B bb;
  private java.lang.reflect.Method me;
}
class ExtRr extends Base { private Object readResolve() { return this; }
  private Thread th;
  private Runnable ru;
  private Thread[] tha;
  private List<Thread> lth;
  private List<Runnable> lru;
  private Runnable[] rua;
  private AbsNoSer abs;
  private B bb;
  private java.lang.reflect.Method me;
}
class ExtWr extends Base { private Object writeReplace() { return this; }
  private Thread th;
  private Runnable ru;
  private Thread[] tha;
  private List<Thread> lth;
  private List<Runnable> lru;
  private Runnable[] rua;
  private AbsNoSer abs;
  private B bb;
  private java.lang.reflect.Method me;
}
class DirUid implements Serializable { private static final long serialVersionUID = 1L;
  private Thread th;
  private Runnable ru;
  private Thread[] tha;
  private List<Thread> lth;
  private List<Runnable> lru;
  private Runnable[] rua;
  private AbsNoSer abs;
  private B bb;
  private java.lang.reflect.Method me;
}
class ExtUid extends Base { private static final long serialVersionUID = 1L;
  private Thread th;
  private Runnable ru;
  private Thread[] tha;
  private List<Thread> lth;
  private List<Runnable> lru;
  private Runnable[] rua;
  private AbsNoSer abs;
  private B bb;
  private java.lang.reflect.Method me;
}
class DirTr implements Serializable { private transient int tr;
  private Thread th;
  private Runnable ru;
  private Thread[] tha;
  private List<Thread> lth;
  private List<Runnable> lru;
  private Runnable[] rua;
  private AbsNoSer abs;
  private B bb;
  private java.lang.reflect.Method me;
}
class ExtTr extends Base { private transient int tr;
  private Thread th;
  private Runnable ru;
  private Thread[] tha;
  private List<Thread> lth;
  private List<Runnable> lru;
  private Runnable[] rua;
  private AbsNoSer abs;
  private B bb;
  private java.lang.reflect.Method me;
}
