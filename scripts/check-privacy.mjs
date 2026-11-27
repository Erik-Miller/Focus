import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

// Scan the files a normal `git add .` could publish, including the lockfile.
// Keep this denylist here only; the runtime has no cloud project configuration.
const files = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  {
    encoding: "utf8",
  },
)
  .split("\0")
  .filter(Boolean);
const forbidden =
  /firebase|firestore|crashlytics|cloudfunctions\.net|firebaseio\.com|appspot\.com/i;
const privateFile =
  /(?:^|\/)(?:\.env(?:\..+)?|focus-credentials\.json|service-account[^/]*\.json)$|\.(?:sqlite|db)(?:-.*)?$|(?:^|\/)(?:local-data|\.artifacts|test-results|\.playwright-cli|output)\//i;
const failures = [];
for (const file of new Set(files)) {
  if (!existsSync(file) || file === "scripts/check-privacy.mjs") continue;
  if (privateFile.test(file) && !file.endsWith(".env.example")) {
    failures.push(`${file}: private data or test artifact must not be published`);
    continue;
  }
  const bytes = readFileSync(file);
  if (forbidden.test(file) || (!bytes.includes(0) && forbidden.test(bytes.toString("utf8")))) {
    failures.push(`${file}: prohibited hosted-backend reference`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    "Privacy audit passed: no prohibited backend references or local user data in publishable files.",
  );
}
