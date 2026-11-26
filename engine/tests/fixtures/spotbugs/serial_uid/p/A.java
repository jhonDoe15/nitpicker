package p;
import java.io.*;
import java.util.*;
class Base implements Serializable {} abstract class AbsBase implements Serializable {} interface SerIf extends Serializable {}
class Dir implements Serializable { 
  private Thread th;
  private Runnable ru;
  private Cloneable cl;
}
class Ext extends Base { 
  private Thread th;
  private Runnable ru;
  private Cloneable cl;
}
class DirUid implements Serializable { private static final long serialVersionUID = 1L;
  private Thread th;
  private Runnable ru;
  private Cloneable cl;
}
class ExtUid extends Base { private static final long serialVersionUID = 1L;
  private Thread th;
  private Runnable ru;
  private Cloneable cl;
}
class ArrUid extends ArrayList<String> { private static final long serialVersionUID = 1L;
  private Thread th;
  private Runnable ru;
  private Cloneable cl;
}
class IfcUid implements SerIf { private static final long serialVersionUID = 1L;
  private Thread th;
  private Runnable ru;
  private Cloneable cl;
}
class ExtUidRo extends Base { private static final long serialVersionUID = 1L;private void readObject(ObjectInputStream s) throws IOException, ClassNotFoundException {}
  private Thread th;
  private Runnable ru;
  private Cloneable cl;
}
class ExtUidI extends Base { private static final int serialVersionUID = 1;
  private Thread th;
  private Runnable ru;
  private Cloneable cl;
}
class ExtUidNs extends Base { private final long serialVersionUID = 1L;
  private Thread th;
  private Runnable ru;
  private Cloneable cl;
}
class ExtStTr extends Base { private static transient int tr;
  private Thread th;
  private Runnable ru;
  private Cloneable cl;
}
class ExtRoBad extends Base { private void readObject() {}
  private Thread th;
  private Runnable ru;
  private Cloneable cl;
}
class ExtRoPub extends Base { public void readObject(ObjectInputStream s) {}
  private Thread th;
  private Runnable ru;
  private Cloneable cl;
}
class ExtRrPub extends Base { public Object readResolve() { return this; }
  private Thread th;
  private Runnable ru;
  private Cloneable cl;
}
class ExtRrStatic extends Base { private static Object readResolve() { return null; }
  private Thread th;
  private Runnable ru;
  private Cloneable cl;
}
class ExtWrRr extends Base { private Object writeReplace() { return this; } private Object readResolve() { return this; }
  private Thread th;
  private Runnable ru;
  private Cloneable cl;
}
class ExtSpf extends Base { private static final ObjectStreamField[] serialPersistentFields = {};
  private Thread th;
  private Runnable ru;
  private Cloneable cl;
}
class ExtAbsUid extends AbsBase { private static final long serialVersionUID = 1L;
  private Thread th;
  private Runnable ru;
  private Cloneable cl;
}
class Ext2 extends Ext { 
  private Thread th;
  private Runnable ru;
  private Cloneable cl;
}
