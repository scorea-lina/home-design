import assert from 'node:assert/strict';
import { extractLatestReplyWithFallback } from '../src/lib/extractLatestReply.js';

function run(name, input, expectedContains) {
  const out = extractLatestReplyWithFallback(input, { minNonWhitespaceChars: 40 });
  assert.ok(
    out.includes(expectedContains),
    `expected output to include: ${expectedContains}\n--- got ---\n${out}`,
  );
  console.log(`PASS: ${name}`);
}

run(
  'gmail on wrote splitter',
  `Hey team,\n\nCan you do this?\n\nOn Tue, Mar 10, 2026 at 10:00 PM Someone <x@y.com> wrote:\n> older thread\n> more\n`,
  'Can you do this?'
);

run(
  'outlook original message splitter',
  `New top reply here\n\n-----Original Message-----\nFrom: Person <a@b.com>\nSent: Tuesday\nTo: Me\nSubject: Re: Thing\n\nold content\n`,
  'New top reply here'
);

run(
  'forwarded header block',
  `Please see below\n\nFrom: Person <a@b.com>\nSent: Tuesday\nTo: Me\nSubject: Fwd: Thing\n\nold\n`,
  'Please see below'
);

run(
  'leading quoted lines removed',
  `> quoted\n> quoted2\n\nActual new line\nMore\n`,
  'Actual new line'
);

console.log('All extractLatestReply tests passed');
