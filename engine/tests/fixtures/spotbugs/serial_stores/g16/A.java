package g16;
import java.util.*;
import java.util.function.*;
import java.io.*;
class A implements Serializable { private Runnable a; void set() { Thread t = new Thread(); a = t; } }
