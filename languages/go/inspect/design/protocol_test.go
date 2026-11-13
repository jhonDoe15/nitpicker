package design

import (
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/calls"
)

const session = `package db

type Session struct{ open bool }

func (s *Session) Begin()  { s.open = true }
func (s *Session) Write()  {}
func (s *Session) Commit() {}
func (s *Session) Rollback() {}

type Conn interface {
	Open()
	Close()
}

type Pg struct{}

func (p *Pg) Open()  {}
func (p *Pg) Close() {}
func (p *Pg) Ping()  {}

type Odd struct{}

func (o *Odd) Open(name string) {}
func (o *Odd) Close()           {}
`

const saver = `package app

import "example.com/shop/db"

type Store struct{ session *db.Session }

func (st *Store) Hold() {
	st.session.Begin()
}

func Save(s *db.Session, ok bool) {
	s.Begin()
	defer s.Rollback()
	s.Write()
	if ok {
		s.Commit()
	} else {
		s.Write()
	}
	if ok {
		if !ok {
			s.Write()
		}
	}
	switch {
	case ok:
		s.Commit()
	default:
		s.Rollback()
	}
	for range 2 {
		defer s.Write()
	}
	func() {
		defer s.Commit()
	}()
	defer func() {
		s.Commit()
	}()
}

func Open(c db.Conn, p *db.Pg, o *db.Odd) {
	c.Open()
	p.Open()
	o.Open("x")
}
`

func renderedCalls(t *testing.T, id string) []string {
	t.Helper()
	facts := factsOf(t, map[string]string{"db/session.go": session, "app/save.go": saver})
	var rows []string
	for _, call := range callableNamed(t, facts, id).Calls {
		rows = append(rows, describeCall(call))
	}
	return rows
}

func describeCall(call calls.Call) string {
	text := fmt.Sprintf("%d %s recv=%s", call.Line, call.Target[strings.LastIndex(call.Target, ".")+1:], call.Receiver)
	if call.Cleanup {
		text += " cleanup"
	}
	if len(call.Branch) > 0 {
		text += " " + strings.Join(call.Branch, ",")
	}
	return text
}

func TestKeysCallsByTheValueTheyAreMadeOn(t *testing.T) {
	got := renderedCalls(t, "app/save.go#Store.Hold")
	if !reflect.DeepEqual(got, []string{"8 Begin recv=this.session"}) {
		t.Fatalf("Hold %v", got)
	}
	open := renderedCalls(t, "app/save.go#Open")
	want := []string{"43 Open recv=c", "44 Open recv=p", "45 Open recv=o"}
	if !reflect.DeepEqual(open, want) {
		t.Fatalf("Open %v", open)
	}
}

func TestMarksCleanupAndBranchesOfEachCall(t *testing.T) {
	got := renderedCalls(t, "app/save.go#Save")
	want := []string{
		"12 Begin recv=s",
		"13 Rollback recv=s cleanup",
		"14 Write recv=s",
		"16 Commit recv=s 0:then",
		"18 Write recv=s 0:else",
		"22 Write recv=s 1:then,2:then",
		"27 Commit recv=s 3:0",
		"29 Rollback recv=s 3:1",
		"32 Write recv=s cleanup",
		"35 Commit recv=s cleanup",
		"38 Commit recv=s cleanup",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Save\n%s\nwant\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
}

func TestSuperTypesFollowEmbeddingAndImplementedInterfaces(t *testing.T) {
	facts := factsOf(t, map[string]string{"db/session.go": session})
	conn := "db/session.go#Conn"
	if got := typeNamed(t, facts, "db/session.go#Pg").Supertypes; !reflect.DeepEqual(got, []string{conn}) {
		t.Fatalf("Pg %v", got)
	}
	for _, name := range []string{"Odd", "Session"} {
		if got := typeNamed(t, facts, "db/session.go#"+name).Supertypes; len(got) != 0 {
			t.Fatalf("%s %v", name, got)
		}
	}
	if !callableNamed(t, facts, "db/session.go#Pg.Open").Entry || callableNamed(t, facts, "db/session.go#Pg.Ping").Entry {
		t.Fatalf("entries %s", dump(facts.Callables))
	}
}

const keeper = `package app

import "example.com/shop/db"

type Keeper struct{ held *db.Session }

func open() *db.Session { return &db.Session{} }

func (k *Keeper) Keep() {
	s := open()
	s.Begin()
	k.held = s
}

func Guarded(ok bool) {
	if s := open(); ok {
		s.Begin()
		defer s.Rollback()
	}
}
`

func TestKeysACallOnALocalStoredInAFieldByTheField(t *testing.T) {
	facts := factsOf(t, map[string]string{"db/session.go": session, "app/keep.go": keeper})
	var keep, guarded []string
	for _, call := range callableNamed(t, facts, "app/keep.go#Keeper.Keep").Calls {
		keep = append(keep, describeCall(call))
	}
	for _, call := range callableNamed(t, facts, "app/keep.go#Guarded").Calls {
		guarded = append(guarded, describeCall(call))
	}
	if !reflect.DeepEqual(keep, []string{"10 go#open recv=", "11 Begin recv=this.held"}) {
		t.Fatalf("Keep %v", keep)
	}
	if !reflect.DeepEqual(guarded, []string{"16 go#open recv=", "17 Begin recv=s 0:then", "18 Rollback recv=s cleanup 0:then"}) {
		t.Fatalf("Guarded %v", guarded)
	}
}
