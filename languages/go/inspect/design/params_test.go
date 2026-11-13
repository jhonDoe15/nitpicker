package design

import (
	"reflect"
	"testing"
)

const catalog = `package catalog

import (
	"context"
	"time"
)

type Item struct{ Name string }

type Prices map[string][]Item

func Connect(ctx context.Context, host, name string, port int, retry func(int) bool) {}

func Pick(item *Item, items []*Item, prices Prices, since time.Time, _ int, rest ...string) (Item, error) {
	return Item{}, nil
}

func (i Item) Rename(to string) {}

func Pair() (a, b int) { return 0, 0 }
`

func TestListsTypedParametersInDeclarationOrder(t *testing.T) {
	facts := factsOf(t, map[string]string{"catalog/catalog.go": catalog})
	connect := callableNamed(t, facts, "catalog/catalog.go#Connect")
	want := []Param{
		{Name: "ctx", Type: "context.Context"},
		{Name: "host", Type: "string"},
		{Name: "name", Type: "string"},
		{Name: "port", Type: "int"},
		{Name: "retry", Type: "func(int)bool"},
	}
	if !reflect.DeepEqual(connect.Params, want) {
		t.Fatalf("Connect %s", dump(connect.Params))
	}
	pick := callableNamed(t, facts, "catalog/catalog.go#Pick")
	wantPick := []Param{
		{Name: "item", Type: "catalog/catalog.go#Item"},
		{Name: "items", Type: "[]*Item"},
		{Name: "prices", Type: "catalog/catalog.go#Prices"},
		{Name: "since", Type: "time.Time"},
		{Name: "_", Type: "int"},
		{Name: "rest", Type: "string", Variadic: true},
	}
	if !reflect.DeepEqual(pick.Params, wantPick) || pick.Returns != "catalog/catalog.go#Item" {
		t.Fatalf("Pick %s returns %s", dump(pick.Params), pick.Returns)
	}
}

func TestListsAMethodWithoutItsReceiverAndNamedResults(t *testing.T) {
	facts := factsOf(t, map[string]string{"catalog/catalog.go": catalog})
	rename := callableNamed(t, facts, "catalog/catalog.go#Item.Rename")
	if len(rename.Params) != 1 || rename.Params[0].Name != "to" || rename.Returns != "" {
		t.Fatalf("Rename %s", dump(rename))
	}
	if got := callableNamed(t, facts, "catalog/catalog.go#Pair").Returns; got != "(int,int)" {
		t.Fatalf("Pair returns %s", got)
	}
}
