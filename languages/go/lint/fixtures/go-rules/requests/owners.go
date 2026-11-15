package requests

import (
	"database/sql"
	"net/http"
	"strings"
)

const (
	lastNameKey = "last_name"
	ownerIDKey  = "owner_id"
	byLastName  = "select name from owner where last_name like ?"
)

type Owners struct {
	db *sql.DB
}

func (o *Owners) FindByLastNameStartingWith(prefix string) []string {
	return []string{prefix, o.db.Stats().WaitDuration.String()}
}

func (o *Owners) FindByID(id string) []string {
	return []string{id, o.db.Stats().WaitDuration.String()}
}

func (o *Owners) Search(r *http.Request) (*sql.Rows, error) {
	lastName := r.URL.Query().Get(lastNameKey) // want untrimmed-request-text
	return o.db.QueryContext(r.Context(), byLastName, lastName)
}

func (o *Owners) Form(r *http.Request) []string {
	return o.FindByLastNameStartingWith(r.FormValue(lastNameKey)) // want untrimmed-request-text
}

func (o *Owners) Trimmed(r *http.Request) []string {
	lastName := strings.TrimSpace(r.URL.Query().Get(lastNameKey))
	return o.FindByLastNameStartingWith(lastName)
}

func (o *Owners) Reassigned(r *http.Request) []string {
	lastName := r.URL.Query().Get(lastNameKey)
	lastName = strings.TrimSpace(lastName)
	return o.FindByLastNameStartingWith(lastName)
}

func (o *Owners) Identifier(r *http.Request) []string {
	id := r.URL.Query().Get(ownerIDKey)
	return o.FindByID(id)
}

func NoLookup(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Last-Name", r.URL.Query().Get(lastNameKey))
}

const insertOwner = "insert into owner (last_name) values (?)"

func (o *Owners) Insert(r *http.Request) error {
	_, err := o.db.ExecContext(r.Context(), insertOwner, r.URL.Query().Get(lastNameKey))
	return err
}

func (o *Owners) Lowered(r *http.Request) []string {
	lastName := r.URL.Query().Get(lastNameKey) // want untrimmed-request-text
	lastName = strings.ToLower(lastName)
	return o.FindByLastNameStartingWith(lastName)
}
