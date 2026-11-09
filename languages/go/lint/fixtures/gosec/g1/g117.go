package g1

import "encoding/json"

type Login struct {
	User     string
	Password string
}

type Profile struct {
	User string
}

func Encoded(login Login, profile Profile) ([]byte, []byte, error) {
	first, err := json.Marshal(login) // want G117
	if err != nil {
		return nil, nil, err
	}
	second, err := json.Marshal(profile)
	return first, second, err
}
