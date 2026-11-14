package design

import (
	"reflect"
	"testing"
)

const ledger = `package ledger

var total int

var names = map[string]int{}

type Ledger struct {
	rows []int
	sum  int
}

func (l *Ledger) Add(row int) {
	l.rows = append(l.rows, row)
	l.sum += row
}

func (l *Ledger) Sum() int { return l.sum }

func (l *Ledger) Rows() int { return len(l.rows) }

func Bump() { total++ }

func Peek() int { return total }

func Name(key string) int { return names[key] }

func Rename(holder struct{ total int }) int { return holder.total }

func Handle() {}

func Audit() {}

func Start() {}
`

const wiring = `package app

import "example.com/shop/ledger"

var routes = map[string]func(){"audit": ledger.Audit}

var started = ledger.Start

func init() {
	ledger.Bump()
}

type Runner struct{ ledger *ledger.Ledger }

func (r *Runner) Total() int { return r.ledger.Sum() }

func Register(add func(func())) {
	add(ledger.Handle)
	add(helper)
}

func Dispatch(key string) {
	routes[key]()
}

func Method(l *ledger.Ledger) func(int) {
	return l.Add
}

func Plain(l *ledger.Ledger) {
	l.Add(1)
	helper()
}

func helper() {}
`

func surfaceFacts(t *testing.T) Facts {
	t.Helper()
	return factsOf(t, map[string]string{"ledger/ledger.go": ledger, "app/wiring.go": wiring})
}

func TestListsTheFieldsAMethodAndAModuleFunctionUse(t *testing.T) {
	facts := surfaceFacts(t)
	want := map[string][]string{
		"ledger/ledger.go#Ledger.Add":  {"rows", "sum"},
		"ledger/ledger.go#Ledger.Sum":  {"sum"},
		"ledger/ledger.go#Ledger.Rows": {"rows"},
		"ledger/ledger.go#Bump":        {"total"},
		"ledger/ledger.go#Peek":        {"total"},
		"ledger/ledger.go#Name":        {"names"},
		"ledger/ledger.go#Rename":      nil,
		"app/wiring.go#Plain":          nil,
	}
	for id, fields := range want {
		if got := callableNamed(t, facts, id).OwnFields; !reflect.DeepEqual(got, fields) {
			t.Errorf("%s: %v, want %v", id, got, fields)
		}
	}
}

func TestListsFunctionsUsedAsValues(t *testing.T) {
	facts := surfaceFacts(t)
	want := map[string][]string{
		"app/wiring.go#Register": {"app/wiring.go#helper", "ledger/ledger.go#Handle"},
		"app/wiring.go#Dispatch": {"ledger/ledger.go#Audit"},
		"app/wiring.go#Method":   {"ledger/ledger.go#Ledger.Add"},
		"app/wiring.go#Plain":    nil,
	}
	for id, references := range want {
		if got := callableNamed(t, facts, id).References; !reflect.DeepEqual(got, references) {
			t.Errorf("%s: %v, want %v", id, got, references)
		}
	}
}

func TestListsWhatAModuleCallsOrUsesWhenItLoads(t *testing.T) {
	facts := surfaceFacts(t)
	got := typeNamed(t, facts, "app/wiring.go").References
	want := []string{"ledger/ledger.go#Audit", "ledger/ledger.go#Bump", "ledger/ledger.go#Start"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("module references %v, want %v", got, want)
	}
}
