package g13;
import java.util.*;
import java.util.function.*;
import java.io.*;
class A implements Externalizable { private Thread a; public A() {} public void writeExternal(ObjectOutput o) {} public void readExternal(ObjectInput i) {} } class B extends A { private Thread b; }
