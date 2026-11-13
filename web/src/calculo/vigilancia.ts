// Estado de las descargas para Inicio, a partir de las líneas de vigilancia del registro (fondos/vigilancia.py).
export type Linea = { ts: string; estado: string; mensaje: string }
export type Tarea = { tarea: string; ts: string; alarmas: string[]; atrasada: boolean }

// Cada cuánto debe pasar cada tarea (horas), con margen: la diaria cada día, universo y composición los domingos
const CADA: Record<string, number> = { precios: 36, 'métricas': 36, universo: 8 * 24, 'composición': 8 * 24 }

/** Última ejecución de cada tarea: sus alarmas (las líneas de error de esa misma ejecución) y si se ha atrasado. */
export function estadoDescargas(lineas: Linea[], ahora: Date): Tarea[] {
  const porTarea = new Map<string, Linea[]>()
  for (const l of lineas) {
    const tarea = l.mensaje.split(':')[0]
    if (tarea in CADA) porTarea.set(tarea, [...(porTarea.get(tarea) ?? []), l])
  }
  return Object.keys(CADA).filter((t) => porTarea.has(t)).map((tarea) => {
    const ls = porTarea.get(tarea)!.sort((a, b) => b.ts.localeCompare(a.ts))
    const ultima = Date.parse(ls[0].ts)
    const deEsa = ls.filter((l) => ultima - Date.parse(l.ts) < 10 * 60e3) // las líneas de una ejecución van seguidas
    return {
      tarea,
      ts: ls[0].ts,
      alarmas: deEsa.reverse().filter((l) => l.estado === 'error').map((l) => l.mensaje.slice(tarea.length + 1).trim()),
      atrasada: ahora.getTime() - ultima > CADA[tarea] * 3600e3,
    }
  })
}
