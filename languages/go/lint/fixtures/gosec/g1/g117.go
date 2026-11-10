package g1

import "encoding/json"

type Login struct {
	User     string
	Password string
}

type Profile struct {
	User string
}

func EncodedLogin(login Login) ([]byte, error) {
	return json.Marshal(login) // want G117
}

func EncodedProfile(profile Profile) ([]byte, error) {
	return json.Marshal(profile)
}
