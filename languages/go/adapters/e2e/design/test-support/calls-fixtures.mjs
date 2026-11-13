const SESSION = `package db

type Session struct {
	open bool
}

func (s *Session) Begin() {
	s.open = true
}

func (s *Session) Write(line string) {
	_ = line
}

func (s *Session) Commit() {
	s.open = false
}

func (s *Session) Rollback() {
	s.open = false
}
`;

const PROTOCOLS_CONFIG = JSON.stringify({
  preset: 'go',
  disable: ['mutation'],
  protocols: [
    { type: 'Session', open: ['Begin'], close: ['Commit', 'Rollback'], steps: ['Write'] },
  ],
});

function saver(name, file, body) {
  return {
    [`internal/${file}`]: `package ${file.split('/')[0]}

import "shop/internal/db"

func ${name}(s *db.Session) {
${body}}
`,
  };
}

const PLAIN_STEPS = '\ts.Begin()\n\ts.Write("x")\n\ts.Commit()\n';

export const UNCLOSED_FILES = {
  'nitpicker.config.json': PROTOCOLS_CONFIG,
  'internal/db/session.go': SESSION,
  ...saver('Save', 'app/save.go', '\ts.Begin()\n\ts.Write("x")\n\ts.Commit()\n'),
};

export const CLOSED_FILES = {
  'nitpicker.config.json': PROTOCOLS_CONFIG,
  'internal/db/session.go': SESSION,
  ...saver(
    'Save',
    'app/save.go',
    '\ts.Begin()\n\tdefer s.Rollback()\n\ts.Write("x")\n\ts.Commit()\n',
  ),
};

export const REPEATED_STEPS_FILES = {
  'internal/db/session.go': SESSION,
  ...saver('Save', 'app/save.go', PLAIN_STEPS),
  ...saver('Update', 'app/update.go', PLAIN_STEPS),
  ...saver('Load', 'jobs/load.go', PLAIN_STEPS),
};

export const TWO_CALLERS_FILES = {
  'internal/db/session.go': SESSION,
  ...saver('Save', 'app/save.go', PLAIN_STEPS),
  ...saver('Load', 'jobs/load.go', PLAIN_STEPS),
};
