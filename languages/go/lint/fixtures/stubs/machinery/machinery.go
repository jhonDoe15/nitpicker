// Package machinery stands in for github.com/RichardKnop/machinery/v2 in the fixtures.
package machinery

type Server struct{}

func (*Server) RegisterTask(string, any) error {
	return nil
}

func (*Server) RegisterTasks(map[string]any) error {
	return nil
}
