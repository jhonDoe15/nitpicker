package sa4

import "net/url"

func LostQuery(address *url.URL) {
	address.Query().Set("page", "1") // want SA4027
}

func SetQuery(address *url.URL) {
	query := address.Query()
	query.Set("page", "1")
	address.RawQuery = query.Encode()
}
