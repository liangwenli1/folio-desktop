// One-click tiling: the synced windows in a grid over the screen's work area, the leader top left. Chromium moves
// its own window through CDP. Firefox has no such command, so the system moves it: on Windows user32 through the
// PowerShell that comes with Windows, on macOS System Events (Accessibility). Linux is only for development and
// doesn't move Firefox windows. The browser process is the one with the profile's folder on its command line.
// The same user32 brings one profile's window to the front for "Go to window" (raise).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { screen, systemPreferences, type Rectangle } from 'electron';
import type { BrowserContext } from 'playwright-core';
import { browserOf } from './launcher';
import type { Tiled } from '../shared/bridge';

type Outcome = 'moved' | NonNullable<Tiled['why']>;
const run = promisify(execFile);

function grid(n: number, area: Rectangle): Rectangle[] {
  const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  const width = Math.floor(area.width / cols), height = Math.floor(area.height / rows);
  return Array.from({ length: n }, (_, i) => ({ x: area.x + (i % cols) * width, y: area.y + Math.floor(i / cols) * height, width, height }));
}

async function moveChromium(ctx: BrowserContext, b: Rectangle){
  const cdp = await ctx.newCDPSession(ctx.pages()[0] ?? await ctx.newPage());
  try {
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    // A maximized or minimized window takes no bounds until it is back to normal.
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: b.x, top: b.y, width: b.width, height: b.height } });
  } finally { await cdp.detach().catch(() => {}); }
}

// Windows: a profile's window is the first visible top-level one of its processes in the engine's window class (the
// front-most first), in physical pixels (the script is per-monitor DPI aware). FOLIO_TILE moves the Firefox windows it
// lists, one line out per window. FOLIO_FRONT brings one window to the front instead, restored if it was minimized:
// Folio is in front when its button is clicked, and a process it starts then may hand the foreground over, which the
// browser itself may not (Windows only flashes it in the taskbar); when that is refused all the same, a tap of Alt
// counts as this process's own input.
const WINDOWS = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class FolioWin {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
  static IntPtr Find(uint[] pids, string cls){
    IntPtr found = IntPtr.Zero;
    EnumWindows((win, l) => {
      uint pid; GetWindowThreadProcessId(win, out pid);
      if (Array.IndexOf(pids, pid) < 0 || !IsWindowVisible(win) || GetWindow(win, 4) != IntPtr.Zero) return true;
      var c = new StringBuilder(64); GetClassName(win, c, 64);
      if (c.ToString() != cls) return true;
      found = win; return false;
    }, IntPtr.Zero);
    return found;
  }
  public static string Move(uint[] pids, int x, int y, int w, int h){
    IntPtr win = Find(pids, "MozillaWindowClass");
    if (win == IntPtr.Zero) return "failed";
    if (IsZoomed(win) || IsIconic(win)) ShowWindow(win, 9);
    return SetWindowPos(win, IntPtr.Zero, x, y, w, h, 0x14) ? "moved" : "failed";
  }
  public static string Front(uint[] pids, string cls){
    IntPtr win = Find(pids, cls);
    if (win == IntPtr.Zero) return "failed";
    if (IsIconic(win)) ShowWindow(win, 9);
    if (SetForegroundWindow(win)) return "front";
    keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero);
    return SetForegroundWindow(win) ? "front" : "failed";
  }
}
'@
[FolioWin]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
$procs = @(Get-CimInstance Win32_Process -Property ProcessId, CommandLine)
function Pids($dir){ [uint32[]]@($procs | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($dir) } | ForEach-Object { $_.ProcessId }) }
if ($env:FOLIO_FRONT) {
  $f = ConvertFrom-Json $env:FOLIO_FRONT
  [FolioWin]::Front((Pids $f.dir), $f.cls)
} else {
  foreach ($t in (ConvertFrom-Json $env:FOLIO_TILE)) { [FolioWin]::Move((Pids $t.dir), $t.x, $t.y, $t.width, $t.height) }
}`;
const powershell = (env: Record<string, string>) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(WINDOWS, 'utf16le').toString('base64')],
  { windowsHide: true, env: { ...process.env, ...env } });

// macOS: the profile's browser process (pid 0 when none) and its front window, in points.
const MAC = `on run argv
  set out to {}
  repeat with i from 1 to (count argv) by 5
    set {p, x, y, w, h} to {(item i of argv) as integer, (item (i + 1) of argv) as integer, (item (i + 2) of argv) as integer, (item (i + 3) of argv) as integer, (item (i + 4) of argv) as integer}
    try
      tell application "System Events"
        tell (first process whose unix id is p)
          set position of window 1 to {x, y}
          set size of window 1 to {w, h}
        end tell
      end tell
      set end of out to "moved"
    on error number n
      if n is -1743 then
        set end of out to "permission"
      else
        set end of out to "failed"
      end if
    end try
  end repeat
  set AppleScript's text item delimiters to linefeed
  return out as text
end run`;

async function moveFirefox(list: { dir: string; cell: Rectangle }[]): Promise<Outcome[]> {
  if (!list.length) return [];
  let out: string;
  if (process.platform === 'win32'){
    const windows = list.map(({ dir, cell }) => ({ dir, ...screen.dipToScreenRect(null, cell) }));
    out = (await powershell({ FOLIO_TILE: JSON.stringify(windows) })).stdout;
  } else if (process.platform === 'darwin'){
    // Asks the first time; until it is allowed, nothing can be moved.
    if (!systemPreferences.isTrustedAccessibilityClient(true)) return list.map(() => 'permission');
    const procs = (await run('ps', ['-axww', '-o', 'pid=,ppid=,args='])).stdout.split('\n')
      .map(l => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l)).filter(m => !!m).map(m => ({ pid: m[1], ppid: m[2], args: m[3] }));
    const args = list.flatMap(({ dir, cell }) => {
      const mine = procs.filter(p => p.args.includes(dir));
      const pid = mine.find(p => !mine.some(q => q.pid === p.ppid))?.pid ?? '0';
      return [pid, ...[cell.x, cell.y, cell.width, cell.height].map(String)];
    });
    out = (await run('osascript', ['-e', MAC, ...args])).stdout;
  } else return list.map(() => 'unsupported');
  const lines = out.trim().split(/\r?\n/);
  return list.map((_, i) => (['moved', 'permission'].includes(lines[i]) ? lines[i] as Outcome : 'failed'));
}

// Lays the windows of these profiles out in a grid, in this order.
export async function tile(ids: string[], area: Rectangle): Promise<Tiled> {
  const cells = grid(ids.length, area);
  const browsers = ids.map(browserOf);
  const firefox = browsers.flatMap((b, i) => (b?.kernel === 'firefox' ? [{ dir: b.dir, cell: cells[i] }] : []));
  const moved = moveFirefox(firefox).catch(() => firefox.map((): Outcome => 'failed'));
  const outcomes = await Promise.all(browsers.map(async (b, i): Promise<Outcome> => {
    if (!b) return 'failed';
    if (b.kernel === 'firefox') return (await moved)[firefox.findIndex(f => f.dir === b.dir)];
    return moveChromium(b.ctx, cells[i]).then(() => 'moved' as const, () => 'failed' as const);
  }));
  const missed = outcomes.filter(o => o !== 'moved');
  return { moved: outcomes.length - missed.length, missed: missed.length, why: (['permission', 'unsupported', 'failed'] as const).find(w => missed.includes(w)) ?? null };
}

// "Go to window", once the engine has shown the profile's tab: on Windows the system brings its window to the front
// (see WINDOWS). Elsewhere the engine's own bringing to front stands.
export async function raise(id: string){
  const b = browserOf(id);
  if (!b || process.platform !== 'win32') return;
  await powershell({ FOLIO_FRONT: JSON.stringify({ dir: b.dir, cls: b.kernel === 'firefox' ? 'MozillaWindowClass' : 'Chrome_WidgetWin_1' }) }).catch(() => {});
}
