package g7;
import java.util.*;
import java.util.function.*;
import java.io.*;
class A implements Serializable { private Runnable a; A() { a = new Thread(); } void set(Runnable r) { a = r; } }
