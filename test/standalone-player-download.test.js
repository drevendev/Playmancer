import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("exact-master Pages workflow retains a preflighted standalone player without hiding live publication failures", async () => {
  const workflow = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
  const packageIndex = workflow.indexOf("- name: Restore and verify the real-game Pages payload after synthetic smoke");
  const restorePreflight = workflow.indexOf("python3 scripts/release-preflight.py _site", packageIndex);
  const retainedIndex = workflow.indexOf("- name: Retain verified standalone player for local serving");
  const pagesIndex = workflow.indexOf("- name: Upload verified Pages payload");
  assert.ok(packageIndex >= 0 && restorePreflight > packageIndex && retainedIndex > restorePreflight &&
    pagesIndex > retainedIndex, "downloadable player must come after validated real-catalog restore and before Pages upload");

  const retain = workflow.slice(retainedIndex, pagesIndex);
  assert.match(retain, /uses: actions\/upload-artifact@v4/);
  assert.match(retain, /name: playmancer-player-\$\{\{ github\.sha \}\}/);
  assert.match(retain, /path: _site\//);
  assert.match(retain, /include-hidden-files: true/, "retain .nojekyll for faithful static payload");
  assert.match(retain, /if-no-files-found: error/, "no silent empty downloads");
  assert.match(retain, /retention-days: 14/);
  assert.match(workflow.slice(pagesIndex), /uses: actions\/upload-pages-artifact@v4/,
    "normal Pages artifact and live verification must remain intact");
  assert.match(workflow, /python3 scripts\/pages_live_probe\.py/,
    "local fallback must never replace public exact-SHA acceptance");
});
