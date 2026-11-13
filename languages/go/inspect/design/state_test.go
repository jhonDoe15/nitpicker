package design

import (
	"reflect"
	"testing"
)

const cartSource = `package orders

type Status int

const (
	Open Status = iota
	Paid
	Closed
)

type Cart struct {
	items  []string
	tags   map[string]string
	total  int
	Config *Settings
}

type Settings struct {
	Timeout int
}

type Reader interface {
	Lines() []string
}

func (c *Cart) Lines() []string { return c.items }

func (c *Cart) Tags() map[string]string { return c.tags }

func (c *Cart) Total() int { return c.total }

func (c *Cart) Copy() []string { return append([]string(nil), c.items...) }

func (s Status) String() string { return "status" }
`

func TestListsTypesFieldsAndEnumCases(t *testing.T) {
	facts := factsOf(t, map[string]string{"orders/cart.go": cartSource})
	cart := typeNamed(t, facts, "orders/cart.go#Cart")
	want := []Field{
		{Name: "items", Mutable: true, Private: true},
		{Name: "tags", Mutable: true, Private: true},
		{Name: "total", Private: true},
		{Name: "Config", Mutable: true},
	}
	if cart.Kind != "class" || !reflect.DeepEqual(cart.Fields, want) {
		t.Fatalf("cart %s", dump(cart))
	}
	status := typeNamed(t, facts, "orders/cart.go#Status")
	if status.Kind != "enum" || !reflect.DeepEqual(status.Cases, []string{"Open", "Paid", "Closed"}) {
		t.Fatalf("status %s", dump(status))
	}
	settings := typeNamed(t, facts, "orders/cart.go#Settings")
	reader := typeNamed(t, facts, "orders/cart.go#Reader")
	if settings.Kind != "data" || reader.Kind != "interface" {
		t.Fatalf("kinds %s", dump(facts.Types))
	}
}

func TestMarksTheMemberThatReturnsAField(t *testing.T) {
	facts := factsOf(t, map[string]string{"orders/cart.go": cartSource})
	got := map[string]string{}
	for _, name := range []string{"Lines", "Tags", "Total", "Copy"} {
		got[name] = callableNamed(t, facts, "orders/cart.go#Cart."+name).ReturnsField
	}
	want := map[string]string{"Lines": "items", "Tags": "tags", "Total": "total", "Copy": ""}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("returnsField %v", got)
	}
	lines := callableNamed(t, facts, "orders/cart.go#Cart.Lines")
	if lines.Owner != "orders/cart.go#Cart" || lines.Kind != "method" || !lines.Exported || lines.Returns != "[]string" {
		t.Fatalf("lines %s", dump(lines))
	}
	reader := callableNamed(t, facts, "orders/cart.go#Reader.Lines")
	if reader.Owner != "orders/cart.go#Reader" || reader.ReturnsField != "" {
		t.Fatalf("interface member %s", dump(reader))
	}
}

const payBanned = `package checkout

import "example.com/shop/orders"

func Pay(cart *orders.Cart) {
	lines := cart.Lines()
	lines[0] = "free"
}

func Wipe(cart *orders.Cart) {
	delete(cart.Tags(), "k")
}

func Rename(cart *orders.Cart) {
	cart.Lines()[1] = "x"
}

func Order(cart *orders.Cart) {
	names := cart.Lines()
	sortStrings(names)
}

func sortStrings(values []string) {}
`

const payAllowed = `package checkout

import (
	"sort"

	"example.com/shop/orders"
)

func Read(cart *orders.Cart) string {
	lines := cart.Lines()
	return lines[0]
}

func Grow(cart *orders.Cart) []string {
	lines := cart.Lines()
	lines = append(lines, "x")
	lines[0] = "y"
	return lines
}

func Copied(cart *orders.Cart) {
	lines := append([]string(nil), cart.Lines()...)
	lines[0] = "z"
	sort.Strings(lines)
}

func Sorted(cart *orders.Cart) {
	sort.Strings(cart.Lines())
}
`

func mutations(t *testing.T, caller string, files map[string]string) map[string]string {
	t.Helper()
	facts := factsOf(t, files)
	found := map[string]string{}
	for _, call := range callableNamed(t, facts, caller).Calls {
		if call.Mutation != "" {
			found[call.Target] = call.Mutation
		}
	}
	return found
}

func TestNamesTheChangeACallerMakesToAReturnedValue(t *testing.T) {
	files := map[string]string{"orders/cart.go": cartSource, "checkout/pay.go": payBanned}
	cases := map[string]map[string]string{
		"Pay":    {"orders/cart.go#Cart.Lines": "assign"},
		"Wipe":   {"orders/cart.go#Cart.Tags": "delete"},
		"Rename": {"orders/cart.go#Cart.Lines": "assign"},
		"Order":  {},
	}
	for name, want := range cases {
		if got := mutations(t, "checkout/pay.go#"+name, files); !reflect.DeepEqual(got, want) {
			t.Errorf("%s: %v, want %v", name, got, want)
		}
	}
}

func TestLeavesReadsAndCopiesUnmarked(t *testing.T) {
	files := map[string]string{"orders/cart.go": cartSource, "checkout/pay.go": payAllowed}
	want := map[string]map[string]string{
		"Read":   {},
		"Grow":   {},
		"Copied": {},
		"Sorted": {"orders/cart.go#Cart.Lines": "sort"},
	}
	for name, expected := range want {
		if got := mutations(t, "checkout/pay.go#"+name, files); !reflect.DeepEqual(got, expected) {
			t.Errorf("%s: %v, want %v", name, got, expected)
		}
	}
}

func TestListsTopLevelFunctionsUnderTheirFileModule(t *testing.T) {
	facts := factsOf(t, map[string]string{"orders/cart.go": cartSource, "checkout/pay.go": payBanned})
	module := typeNamed(t, facts, "checkout/pay.go")
	pay := callableNamed(t, facts, "checkout/pay.go#Pay")
	if module.Kind != "module" || module.Name != "pay" || pay.Owner != "checkout/pay.go" || pay.Kind != "function" {
		t.Fatalf("module %s, pay %s", dump(module), dump(pay))
	}
	if len(pay.Params) != 1 || pay.Params[0].Type != "orders/cart.go#Cart" {
		t.Fatalf("params %s", dump(pay.Params))
	}
}
