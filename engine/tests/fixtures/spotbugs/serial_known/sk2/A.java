package sk2;
import java.util.concurrent.locks.*;
class A implements java.io.Serializable { private Lock a; void m() { Object o = new ReentrantLock(); } }
