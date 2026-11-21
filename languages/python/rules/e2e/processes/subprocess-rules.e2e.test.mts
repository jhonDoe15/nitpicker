import { useRuleScripts } from '../../test-support/python-rule-scripts.mts';

const RULES = [
  'growing-process-arguments',
  'unguarded-option-list',
  'status-only-spawn-check',
  'stderr-as-failure',
  'head-cut-error-output',
  'wrapper-only-timeout',
] as const;

const { itOutcomes, describeRules } = useRuleScripts(RULES, {
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('python subprocess rules', () => {
  itOutcomes('growing-process-arguments flags listings and path lists in process arguments', [
    [
      'os.pathsep.join, glob spread and listdir concatenation',
      'import glob\nimport os\nimport subprocess\nfrom pathlib import Path\n\n\ndef run(classpath, root):\n    subprocess.run(["java", "-cp", os.pathsep.join(classpath), "Main"], timeout=30)\n    subprocess.run(["ruff", "check", *glob.glob("**/*.py")], timeout=30)\n    files = [str(p) for p in Path(root).rglob("*.py")]\n    subprocess.run(["tool", "--sources", ",".join(files)], timeout=30)\n    subprocess.run(["tool"] + os.listdir(root), timeout=30)\n',
      [
        'growing-process-arguments:8 os.pathsep.join(classpath)',
        "growing-process-arguments:9 *glob.glob('**/*.py')",
        "growing-process-arguments:11 ','.join(files)",
        "unguarded-option-list:11 --sources ','.join(files)",
        'growing-process-arguments:12 os.listdir(root)',
      ],
    ],
    [
      'allows CLASSPATH env, fixed literals, slices, chunks and non-listing parameters',
      'import os\nimport subprocess\n\n\ndef run(changed, dirs, lib_dir, classes_dir, root, chunks, args_file):\n    subprocess.run(["tool", "--format", "json", *changed], timeout=30)\n    subprocess.run(["tool", "--dirs", ",".join(dirs)], timeout=30)\n    subprocess.run(["java", "-cp", os.pathsep.join([lib_dir, classes_dir]), "Main"], timeout=30)\n    subprocess.run(["java", "Main"], env={"CLASSPATH": os.pathsep.join(dirs)}, timeout=30)\n    subprocess.run(["tool", *os.listdir(root)[:10]], timeout=30)\n    for chunk in chunks(os.listdir(root), 200):\n        subprocess.run(["tool", *chunk], timeout=30)\n    subprocess.run(["javac", f"@{args_file}"], timeout=30)\n',
      [],
    ],
  ]);

  itOutcomes(
    'unguarded-option-list flags filtered or listed option values without emptiness checks',
    [
      [
        'filtered comprehension and os.listdir joined after a flag',
        'import os\nimport subprocess\n\n\ndef lint(all_dirs, exists, root):\n    dirs = [d for d in all_dirs if exists(d)]\n    subprocess.run(["linter", "--dir", ",".join(dirs), "--format", "sarif"], timeout=30)\n    files = os.listdir(root)\n    subprocess.run(["tool", "-f", " ".join(files)], timeout=30)\n',
        [
          "unguarded-option-list:7 --dir ','.join(dirs)",
          "growing-process-arguments:9 ' '.join(files)",
          "unguarded-option-list:9 -f ' '.join(files)",
        ],
      ],
      [
        'allows guarded lists, direct parameters, fixed literals and positional args',
        'import subprocess\n\n\ndef lint(all_dirs, exists, dirs):\n    subprocess.run(["linter", "--dir", ",".join(dirs)], timeout=30)\n    checked = [d for d in all_dirs if exists(d)]\n    if not checked:\n        return\n    subprocess.run(["linter", "--dir", ",".join(checked)], timeout=30)\n    fixed = ["src", "lib"]\n    subprocess.run(["linter", "--dir", ",".join(fixed)], timeout=30)\n    unfiltered = [str(d) for d in all_dirs]\n    subprocess.run(["linter", "--dir", ",".join(unfiltered)], timeout=30)\n    positional = [d for d in all_dirs if exists(d)]\n    subprocess.run(["linter", "src", ",".join(positional)], timeout=30)\n',
        [],
      ],
    ],
  );

  itOutcomes('status-only-spawn-check flags signal-missing and None-mishandling status checks', [
    [
      'returncode > 0 on subprocess.run and unchecked poll()/returncode on Popen',
      'import subprocess\nimport sys\n\n\ndef run_a():\n    result = subprocess.run(["tool"], timeout=30, check=False)\n    if result.returncode > 0:\n        raise RuntimeError(result.stderr)\n\n\ndef run_b():\n    proc = subprocess.Popen(["tool"])\n    sys.exit(proc.poll())\n\n\ndef run_c():\n    proc = subprocess.Popen(["tool"])\n    if proc.returncode:\n        raise RuntimeError("failed")\n',
      [
        'status-only-spawn-check:7 result.returncode > 0',
        'status-only-spawn-check:13 sys.exit(proc.poll())',
        'status-only-spawn-check:18 proc.returncode',
      ],
    ],
    [
      'allows != 0, == 0, check=True, signal check and explicit None guard',
      'import subprocess\nimport sys\n\n\ndef run_ok():\n    result = subprocess.run(["tool"], timeout=30, check=False)\n    if result.returncode != 0:\n        raise RuntimeError(result.stderr)\n    other = subprocess.run(["tool"], timeout=30, check=False)\n    if other.returncode < 0:\n        raise RuntimeError("killed")\n    if other.returncode > 0:\n        raise RuntimeError("failed")\n    proc = subprocess.Popen(["tool"])\n    code = proc.poll()\n    if code is not None and code != 0:\n        sys.exit(code)\n',
      [],
    ],
  ]);

  itOutcomes('stderr-as-failure flags raising or exiting on non-empty stderr alone', [
    [
      'if result.stderr, len(stderr) > 0, or-combined stderr, and communicate tuple',
      'import subprocess\nimport sys\n\n\ndef check_a():\n    result = subprocess.run(["fmt"], capture_output=True, text=True, timeout=30, check=False)\n    if result.stderr:\n        raise RuntimeError(result.stderr)\n\n\ndef check_b():\n    result = subprocess.run(["fmt"], capture_output=True, text=True, timeout=30, check=False)\n    if result.returncode != 0 or len(result.stderr.strip()) > 0:\n        sys.exit(1)\n\n\ndef check_c():\n    with subprocess.Popen(["fmt"], stderr=subprocess.PIPE) as proc:\n        _, err = proc.communicate(timeout=30)\n        if err.decode().strip() != "":\n            raise RuntimeError(err)\n',
      [
        'stderr-as-failure:7 result.stderr',
        'stderr-as-failure:13 len(result.stderr.strip()) > 0',
        "stderr-as-failure:20 err.decode().strip() != ''",
      ],
    ],
    [
      'allows exit status checks, and-combined checks, substring checks, warnings and Popen.stderr stream',
      'import logging\nimport subprocess\n\nlogger = logging.getLogger(__name__)\n\n\ndef ok():\n    result = subprocess.run(["fmt"], capture_output=True, text=True, timeout=30, check=False)\n    if result.returncode != 0:\n        raise RuntimeError(result.stderr)\n    if result.returncode != 0 and result.stderr:\n        raise RuntimeError(result.stderr)\n    if "fatal" in result.stderr:\n        raise RuntimeError(result.stderr)\n    if result.stderr:\n        logger.warning(result.stderr)\n    proc = subprocess.Popen(["fmt"], stderr=subprocess.PIPE)\n    if proc.stderr:\n        raise RuntimeError("stream")\n',
      [],
    ],
  ]);

  itOutcomes('head-cut-error-output flags slicing tool output from the start into an error', [
    [
      'head slice in raise, error constructor, logger.error and held variable',
      'import logging\nimport subprocess\n\nlogger = logging.getLogger(__name__)\nLIMIT = 4000\n\n\ndef build(args):\n    result = subprocess.run(args, capture_output=True, text=True, timeout=30, check=False)\n    if result.returncode != 0:\n        raise RuntimeError(f"failed: {result.stderr[:4000]}")\n\n\ndef compile_more(build_stderr, error_output):\n    logger.error("compile failed: %s", build_stderr[:3000])\n    head = error_output[0:LIMIT]\n    raise ValueError(head)\n',
      [
        'head-cut-error-output:11 result.stderr[:4000]',
        'head-cut-error-output:15 build_stderr[:3000]',
        'head-cut-error-output:16 error_output[0:LIMIT]',
      ],
    ],
    [
      'allows tail slices, head-plus-tail, short prefixes, measured ends and non-error sinks',
      'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef ok(stderr, stdout, title, show):\n    preview = stdout[:200]\n    show(preview)\n    logger.info("output: %s", stdout[:500])\n    raise RuntimeError(f"failed: {stderr[-4000:]}")\n\n\ndef both_ends(stderr):\n    raise RuntimeError(f"{stderr[:2000]} ... {stderr[-2000:]}")\n\n\ndef short_and_measured(stdout, stderr, title):\n    if stdout[:3] != "3.1":\n        raise ValueError(f"unsupported {stdout[:3]} for {title[:80]}")\n    raise RuntimeError(stderr[: stderr.rfind("\\n")])\n',
      [],
    ],
  ]);

  itOutcomes('wrapper-only-timeout flags timed wrapper calls without process-group termination', [
    [
      'npm run, pnpm test, script file, bash script and compound shell command with timeout',
      'import subprocess\n\n\ndef build():\n    subprocess.run(["gradlew.bat", "check"], timeout=60)\n    subprocess.run(["pnpm", "--filter", "app", "test"], timeout=60)\n    subprocess.run(["./scripts/build.sh", "--all"], timeout=60)\n    subprocess.run(["bash", "scripts/run"], timeout=60)\n    subprocess.run(["sh", "-c", "make && make test"], timeout=60)\n    subprocess.run("cd app && make test", shell=True, timeout=60)\n    subprocess.Popen(["npx", "vitest", "run"], start_new_session=True).wait(timeout=30)\n',
      [
        'wrapper-only-timeout:5 `gradlew.bat`',
        'wrapper-only-timeout:6 `pnpm`',
        'wrapper-only-timeout:7 `./scripts/build.sh`',
        'wrapper-only-timeout:8 `bash`',
        'wrapper-only-timeout:9 `sh`',
        'wrapper-only-timeout:10 a shell',
        'wrapper-only-timeout:11 `npx`',
      ],
    ],
    [
      'allows direct executables, non-script package commands, simple sh -c, untimed calls and group kills',
      'import os\nimport signal\nimport subprocess\n\n\ndef ok():\n    subprocess.run(["git", "status"], timeout=60)\n    subprocess.run(["./gradlew", "check"], timeout=60)\n    subprocess.run(["npm", "view", "nx", "--json"], timeout=30)\n    subprocess.run(["pnpm", "install", "--frozen-lockfile"], timeout=30)\n    subprocess.run(["sh", "-c", "make test"], timeout=60)\n    subprocess.run(["bash", "--version"], timeout=5)\n    subprocess.run("git status 2>&1", shell=True, timeout=5)\n    subprocess.run(["npm", "run", "build"])\n    subprocess.run(["npm", "run", "build"], timeout=0)\n    with subprocess.Popen(["npm", "run", "build"], start_new_session=True) as proc:\n        try:\n            proc.wait(timeout=60)\n        except subprocess.TimeoutExpired:\n            os.killpg(proc.pid, signal.SIGKILL)\n            raise\n',
      [],
    ],
  ]);

  itOutcomes('skips test files', [
    [
      'test module with subprocess anti-patterns',
      {
        file: 'tests/test_cli.py',
        code: 'import os\nimport subprocess\n\n\ndef test_cli(classpath):\n    subprocess.run(["java", "-cp", os.pathsep.join(classpath), "Main"], timeout=30)\n    subprocess.run(["npm", "run", "build"], timeout=30)\n',
      },
      [],
    ],
  ]);
});
