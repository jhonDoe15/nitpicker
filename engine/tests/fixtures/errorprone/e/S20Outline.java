import com.google.gwt.dom.client.Style;
import com.google.gwt.dom.client.Style.Unit;
import com.google.gwt.safehtml.client.SafeHtmlTemplates;
import com.google.gwt.safehtml.client.SafeHtmlTemplates.Template;

interface S20Outline extends SafeHtmlTemplates {
  String NONE = "outline:none";

  @Template("<div style=\"outline:none\">{0}</div>")
  String a(String s);

  @Template("<div style=\"outline: none;\">{0}</div>")
  String b(String s);

  @Template("<div style=\"outline :0px\">{0}</div>")
  String c(String s);

  @Template("<div style=\"outline: 0\">{0}</div>")
  String d(String s);

  @Template("<div style=\"outline:solid\">{0}</div>")
  String e(String s);

  @Template(NONE)
  String f();

  @Template(value = "outline\t:\nnone")
  String g();

  @SafeHtmlTemplates.Template("x outline:0px")
  String h();

  @Template("outline:nonexistent")
  String i();

  @Template("my-outline:none")
  String j();

  @SuppressWarnings("OutlineNone")
  @Template("outline:none")
  String k();

  @Deprecated
  String l();

  class Use {
    void use(Style style, String value, double d) {
      style.setProperty("outline", "none");
      style.setProperty("outline", "0px");
      style.setProperty("outline", "1px");
      style.setProperty("outline", 0, Unit.PX);
      style.setProperty("outline", 0.0, Unit.EM);
      style.setProperty("outline", 2, Unit.PX);
      style.setProperty("outline", d, Unit.PX);
      style.setPropertyPx("outline", 0);
      style.setPropertyPx("outline", 3);
      style.setProperty("color", "none");
      style.setProperty("outline", value);
      style.setProperty("out" + "line", "none");
      style.setWidth(0, Unit.PX);
      style.setProperty("outline", NONE.substring(0, 0));
    }

    @SuppressWarnings("OutlineNone")
    void suppressed(Style style) {
      style.setProperty("outline", "none");
    }
  }
}
