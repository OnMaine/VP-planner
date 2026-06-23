export function useCoordInput() {
  function filterCoordsInput(e: Event): void {
    const input = e.target as HTMLInputElement
    const sel = input.selectionStart ?? input.value.length
    let v = input.value.replace(/[^0-9|]/g, '')
    const pipe = v.indexOf('|')
    if (pipe !== -1) {
      v = v.slice(0, pipe + 1) + v.slice(pipe + 1).replace(/\|/g, '')
    }
    const parts = v.split('|')
    const left = parts[0].slice(0, 3)
    const right = (parts[1] ?? '').slice(0, 3)
    const formatted =
      pipe === -1 && left.length === 3
        ? left + '|' + right
        : left + (pipe !== -1 ? '|' : '') + right
    if (input.value !== formatted) {
      input.value = formatted
      const shift = formatted.length - v.length
      input.setSelectionRange(sel + shift, sel + shift)
    }
  }

  return { filterCoordsInput }
}
