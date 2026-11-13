package g1

import "encoding/json"

type Login struct {
	User     string `json:"user"`
	Password string `json:"password"`
}

type Profile struct {
	User string `json:"user"`
}

func EncodedLogin(login Login) ([]byte, error) {
	return json.Marshal(login) // want G117
}

func EncodedProfile(profile Profile) ([]byte, error) {
	return json.Marshal(profile)
}
