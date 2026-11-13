package design

import (
	"reflect"
	"testing"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/uses"
)

const appContext = `package app

type Context struct {
	Clock  func() int
	Rates  map[string]int
	DB     string
	Mailer string
	Logger string
	Config string
}

func (c *Context) Now() int { return c.Clock() }
`

const placing = `package orders

import (
	"example.com/shop/app"
	"example.com/shop/billing"
)

func Place(ctx *app.Context, id string) int {
	if ctx == nil {
		return 0
	}
	return billing.Charge(ctx, id) + ctx.Now()
}

func Hold(ctx *app.Context) {
	run(func() { _ = ctx.DB })
}

func Keep(ctx *app.Context) *app.Context {
	return ctx
}

func Hand(ctx app.Context) int {
	return audit(ctx, 1, 2)
}

func Loop(ctx *app.Context) {
	for range 2 {
		Place(ctx, "x")
	}
}

func audit(ctx app.Context, rest ...int) int { return len(rest) }

func run(callback func()) { callback() }

func Unknown(ctx *app.Context) {
	other(ctx)
}
`

const charging = `package billing

import "example.com/shop/app"

func Charge(ctx *app.Context, id string) int {
	return ctx.Rates[id] + ctx.Clock()
}
`

func usesOf(t *testing.T, name string) []uses.ParamUse {
	t.Helper()
	facts := factsOf(t, map[string]string{
		"app/context.go":    appContext,
		"orders/place.go":   placing,
		"billing/charge.go": charging,
	})
	return callableNamed(t, facts, name).ParamUses
}

func TestListsTheFieldsAndForwardsOfAWholeValueParameter(t *testing.T) {
	got := usesOf(t, "orders/place.go#Place")
	want := []uses.ParamUse{{
		Param: 0, Fields: []string{"Now"},
		Forwards: []uses.Forward{{Target: "billing/charge.go#Charge", Position: 0}},
	}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Place %s", dump(got))
	}
	charge := usesOf(t, "billing/charge.go#Charge")
	if len(charge) != 1 || !reflect.DeepEqual(charge[0].Fields, []string{"Clock", "Rates"}) || charge[0].Opaque {
		t.Fatalf("Charge %s", dump(charge))
	}
}

func TestMarksAnyOtherUseOfTheValueOpaque(t *testing.T) {
	cases := map[string]bool{
		"Hold": true, "Keep": true, "Unknown": true, "Place": false, "Loop": false, "Hand": false,
	}
	for name, opaque := range cases {
		got := usesOf(t, "orders/place.go#"+name)
		if len(got) != 1 || got[0].Opaque != opaque {
			t.Errorf("%s opaque %v, want %v: %s", name, got, opaque, dump(got))
		}
	}
}

func TestListsOnlyParametersOfProjectTypes(t *testing.T) {
	got := usesOf(t, "orders/place.go#Loop")
	want := []uses.ParamUse{{
		Param: 0, Fields: []string{},
		Forwards: []uses.Forward{{Target: "orders/place.go#Place", Position: 0}},
	}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Loop %s", dump(got))
	}
}
