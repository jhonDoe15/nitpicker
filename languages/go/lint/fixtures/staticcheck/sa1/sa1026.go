package sa1

import "encoding/json"

type Job struct {
	Name string `json:"name"`
	Run  func() `json:"run"`
}

func MarshalFunc(job Job) ([]byte, error) {
	return json.Marshal(job) // want SA1026
}

type JobData struct {
	Name string `json:"name"`
}

func MarshalData(job JobData) ([]byte, error) {
	return json.Marshal(job)
}
