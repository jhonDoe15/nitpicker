import fs from 'node:fs';
if (fs.existsSync(this.config.file)) { fs.createReadStream(this.config.file).pipe(out); }