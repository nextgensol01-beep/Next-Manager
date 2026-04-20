/**
 * Run this to generate your admin password hash.
 * Usage:  node scripts/generate-hash.js yourpassword
 * Then copy the output into ADMIN_PASSWORD_HASH in .env.local
 */
const bcrypt = require("bcryptjs");

const password = process.argv[2];

if (!password) {
  console.error("\n❌  Usage: node scripts/generate-hash.js <your-password>\n");
  process.exit(1);
}

if (password.length < 8) {
  console.warn("\n⚠️  Warning: password is shorter than 8 characters.\n");
}

bcrypt.hash(password, 12).then((hash) => {
  console.log("\n✅  Password hash generated!\n");
  console.log("Paste this into your .env.local:\n");
  console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
});
