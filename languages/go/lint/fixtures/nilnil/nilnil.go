package nilnil

import "errors"

type User struct {
	Name string
}

var ErrNoUser = errors.New("no user")

func Find(users map[string]*User, name string) (*User, error) {
	user, found := users[name]
	if !found {
		return nil, nil // want nilnil
	}
	return user, nil
}

func FindOrFail(users map[string]*User, name string) (*User, error) {
	user, found := users[name]
	if !found {
		return nil, ErrNoUser
	}
	return user, nil
}
