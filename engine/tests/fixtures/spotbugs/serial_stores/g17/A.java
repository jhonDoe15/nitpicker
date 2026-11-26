package g17;
import java.util.*;
import java.util.function.*;
import java.io.*;
class A implements Serializable { private List<Runnable> a = new ArrayList<>(); void add() { a.add(new Thread()); } }
