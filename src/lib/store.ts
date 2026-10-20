// Browser storage wrapper: every read and write is guarded (private windows, blocked storage).
export const LS = {
  units: 'csbd.units.v1',
  cases: 'csbd.cases.v1',
  last: 'csbd.last.v1',
  tab: 'csbd.tab.v1',
  theme: 'csbd.theme',
} as const;

export const store = {
  get(k: string): any {
    try {
      return JSON.parse(localStorage.getItem(k) as string);
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown): boolean {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  },
};

export function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}
