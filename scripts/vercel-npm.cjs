const { spawnSync } = require("node:child_process");

const commands = { install: "npm ci", build: "npm run build" };
const step = process.argv[2];
if (!Object.hasOwn(commands, step)) {
  throw new Error("Usage: node scripts/vercel-npm.cjs <install|build>");
}

const env = { ...process.env };
// Vercel can pass a pnpm cache setting with an npm prefix that npm rejects.
delete env.npm_config_cache_dir;
delete env.NPM_CONFIG_CACHE_DIR;

const { status, error } = spawnSync(commands[step], {
  env,
  shell: true,
  stdio: "inherit",
});
if (error) throw error;
process.exitCode = status ?? 1;
