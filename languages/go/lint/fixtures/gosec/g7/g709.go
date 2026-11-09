package g7

import (
	"encoding/gob"
	"encoding/json"
	"net/http"
	"strings"
)

type User struct {
	Name string
}

func Decoded(request *http.Request) (User, error) {
	var user User
	err := gob.NewDecoder(strings.NewReader(request.FormValue("data"))).Decode(&user) // want G709
	return user, err
}

func DecodedJSON(request *http.Request) (User, error) {
	var user User
	err := json.Unmarshal([]byte(request.FormValue("data")), &user)
	return user, err
}
