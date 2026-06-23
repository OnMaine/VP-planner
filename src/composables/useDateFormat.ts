export function useDateFormat() {
  function formatDT(d: Date): string {
    const p2 = (n: number) => String(n).padStart(2, '0')
    const p3 = (n: number) => String(n).padStart(3, '0')
    return (
      `${p2(d.getDate())}.${p2(d.getMonth() + 1)} ` +
      `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${p3(d.getMilliseconds())}`
    )
  }

  function toDatetimeLocal(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0')
    return (
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
      `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    )
  }

  return { formatDT, toDatetimeLocal }
}
