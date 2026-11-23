import { test } from '@playwright/test';

/**
 * Marks the current test as pinning a known bug (listed in e2e/STRATEGY.md, "Bugs found") and returns
 * the message to give the assertions of the wrong behaviour.
 *
 * A known-bug test is an ordinary test: every step that leads to the bug is asserted as usual (a
 * missing button or a page that does not load fails it), then it asserts precisely what the
 * application wrongly does today. So it passes only while that exact bug is there. When the bug is
 * fixed, one of those assertions fails with this message: then turn them into the correct
 * expectation written next to them, remove the `@known-bug` tag and the entry in STRATEGY.md.
 */
export function knownBug(id: string, summary: string): (symptom: string) => string {
  test.info().annotations.push({ type: 'known-bug', description: `${id}: ${summary}` });
  return (symptom) =>
    `${id} (known bug) still present: ${symptom}. If this assertion fails, ${id} may have been ` +
    `fixed: assert the correct behaviour instead and drop @known-bug (e2e/STRATEGY.md).`;
}
