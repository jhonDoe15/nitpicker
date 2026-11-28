let client;
let server;
let cached;
let root;
const fixed = {};

beforeEach(async () => {
  client ??= await connect();
});

it('reads the server', async () => {
  server = server ?? (await startServer());
  if (!cached) {
    cached = loadFixtures();
  }
  root ||= path.join('a', 'b');
  fixed.value ??= build();
});

it('guards early', () => {
  if (cached) return cached;
  cached = loadFixtures();
});

function helper() {
  if (cached === undefined) cached = readAll();
}

it('uses a helper', () => {
  helper();
});
