package e;

import com.google.common.collect.BiMap;
import com.google.common.collect.HashBiMap;
import com.google.common.collect.ImmutableBiMap;
import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableMap;
import com.google.common.collect.ImmutableSet;
import java.net.URL;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

public class B4Guava {
  void m(URL url, String s) throws Exception {
    Set<URL> a = new HashSet<URL>();
    Set<URL> b = new HashSet<>();
    Map<URL, String> c = new HashMap<>();
    Map<String, URL> d = new HashMap<>();
    Set<String> e = new HashSet<>();
    Set<URL> f = ImmutableSet.of(url);
    Map<URL, String> g = ImmutableMap.of(url, s);
    BiMap<String, URL> h = HashBiMap.create();
    BiMap<URL, String> i = HashBiMap.create();
    Set<URL> j = ImmutableSet.<URL>builder().add(url).build();
    Map<URL, Integer> k = ImmutableMap.<URL, Integer>builder().put(url, 1).build();
    Set<URL> l = new LinkedHashSet<URL>(a);
    Object n = new TreeMap<URL, String>();
    List<URL> o = ImmutableList.of(url);
    Set<URL> p = ImmutableSet.copyOf(a);
    Set<String> q = ImmutableSet.of(s);
    var r = new HashSet<URL>();
    Set<URL> t = new HashSet<URL>() {};
  }

  @SuppressWarnings("URLEqualsHashCode")
  void sup() {
    Set<URL> a = new HashSet<URL>();
  }
}
