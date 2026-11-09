package sa9

import "encoding/json"

type hidden struct {
	name string
}

func MarshalHidden() ([]byte, error) {
	return json.Marshal(hidden{name: "a"}) // want SA9005
}

type Visible struct {
	Name string `json:"name"`
}

func MarshalVisible() ([]byte, error) {
	return json.Marshal(Visible{Name: "a"})
}
