package g20;
import java.util.*;
import java.util.function.*;
import java.io.*;
class A implements Serializable { private Runnable a; A() { a = new Thread(); } private void readObject(ObjectInputStream s) {} }
