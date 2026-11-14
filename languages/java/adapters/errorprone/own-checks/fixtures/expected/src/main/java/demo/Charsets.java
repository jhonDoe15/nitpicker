package demo;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

public class Charsets {
  Charset charsets(String name) {
    Charset utf8 = StandardCharsets.UTF_8;
    Charset dynamic = Charset.forName(name);
    Charset legacy = Charset.forName("windows-1252");
    return utf8.equals(dynamic) ? legacy : utf8;
  }
}
