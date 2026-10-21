import { describe, expect, it } from 'vitest';
import { TEMPLATE, parseCsv, readProfiles } from '../../src/renderer/src/csv';

describe('parseCsv', () => {
  it('reads quotes, escaped quotes, line breaks inside quotes and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\r\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"\nthere']]);
  });

  it('picks tabs or semicolons when the header uses them, and drops a byte-order mark and blank rows', () => {
    expect(parseCsv('﻿name\tos\nA\twin\n\n')).toEqual([['name', 'os'], ['A', 'win']]);
    expect(parseCsv('name;os\nA;mac')).toEqual([['name', 'os'], ['A', 'mac']]);
  });
});

describe('readProfiles', () => {
  it('reads the example, with defaults and aliases', () => {
    const { rows, errors } = readProfiles(TEMPLATE);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, name: 'US-Store-01', group: 'US stores', tags: ['flagship', 'new'], os: 'windows', kernel: 'chromium', proxy: 'socks5://user:pass@us1.example.net:1080', timezone: null, language: null, notes: null },
      { line: 3, name: 'EU-Store-DE-01', group: 'EU stores', tags: [], os: 'macos', kernel: 'firefox', proxy: 'de1.example.net:8080:user:pass', timezone: 'Europe/Berlin', language: 'de-DE', notes: 'Shop admin' }
    ]);
    expect(readProfiles('名称,系统,内核\n店铺 1,Windows 11,\n店铺 2,macOS 15,Chrome').rows.map(r => [r.name, r.os, r.kernel]))
      .toEqual([['店铺 1', 'windows', 'chromium'], ['店铺 2', 'macos', 'chromium']]);
  });

  it('reports each row it cannot use, with the line number in the file', () => {
    const text = 'name,os,engine,timezone,language,tags\n,windows\nB,xp\nC,,safari\nD,,,Mars/Base\nE,,,,english\nF,,,,,a|b|c|d|e|f|g|h|i|j|k\nG';
    const { rows, errors } = readProfiles(text);
    expect(rows.map(r => r.name)).toEqual(['G']);
    expect(errors).toEqual([
      { line: 2, problem: 'name', value: '' }, { line: 3, problem: 'os', value: 'xp' }, { line: 4, problem: 'engine', value: 'safari' },
      { line: 5, problem: 'timezone', value: 'Mars/Base' }, { line: 6, problem: 'language', value: 'english' }, { line: 7, problem: 'tags' }
    ]);
  });

  it('needs a name column', () => {
    expect(readProfiles('title,os\nA,windows')).toEqual({ rows: [], errors: [{ line: 1, problem: 'header' }] });
  });
});
