import { execSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'child_process';
import execa from 'execa';
import crossSpawn from 'cross-spawn';
import { readFile } from 'node:fs/promises';
import type { Options } from 'execa';

const lazy = import('node:child_process');
const other = import('node:path');
const dynamic = import(`node:${'child_process'}`);
const legacy = require('cross-spawn');
const fine = require('node:path');
const member = module.require('child_process');
const computed = require(name);

export { execSync, spawn, execa, crossSpawn, readFile, lazy, other, dynamic, legacy, fine, member, computed };
export type { ChildProcess, Options };
