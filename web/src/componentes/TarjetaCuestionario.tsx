import { cifra } from '../calculo/formato'
import { dato, PREGUNTAS, respuesta, type Cuestionario, type Frente } from '../calculo/cuestionario'
import Tarjeta from './Tarjeta'

const GRUPOS: [Frente, string][] = [['índice', 'Frente a su índice (puro, sin comisiones)'], ['categoría', 'Frente a su categoría'], ['fondo', 'El propio fondo']]
const COLOR = { 'sí': 'text-sube', 'a medias': 'text-aviso', 'no': 'text-baja' } as const

/** Las nueve preguntas de la nota 1–100: respuesta, la cifra que la contesta y los puntos que da. */
export default function TarjetaCuestionario({ c, valor, percentil, patrimonio }: {
  c: Cuestionario | null; valor: (k: string) => number | null | undefined; percentil: (k: string) => number | null | undefined; patrimonio: number | null
}) {
  if (!c) {
    return (
      <Tarjeta titulo="Cuestionario">
        <p className="text-suave">Sin nota: hace falta 3 años de historia y poder contestar preguntas que valgan al menos 70 puntos (sin índice de referencia, no se puede).</p>
      </Tarjeta>
    )
  }
  return (
    <Tarjeta titulo="Cuestionario" extra={<span className="text-[12px] text-suave">{cifra(c.puntos, 1)} de {cifra(c.posibles, 0)} puntos posibles · métricas a {c.plazo} años</span>}>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="cifra text-[34px] font-extrabold leading-none">{Math.round(c.nota)}</span>
        <span className="text-[13px] text-suave">de 100</span>
      </div>
      <table className="w-full text-[13px] tabular">
        {GRUPOS.map(([frente, titulo]) => (
          <tbody key={frente}>
            <tr><th colSpan={4} className="rotulo pb-1 pt-2 text-left font-normal">{titulo}</th></tr>
            {PREGUNTAS.filter((p) => p.frente === frente).map((p) => {
              const r = respuesta(p, c.puntosDe[p.clave])
              const d = dato(p, c.plazo, valor, percentil, patrimonio)
              return (
                <tr key={p.clave} className={`border-t border-borde/50 ${r ? '' : 'text-suave'}`} title={p.regla}>
                  <td className="py-1 pr-2 text-left">{p.texto}</td>
                  <td className="py-1 pr-2 text-right text-suave">{d ?? ''}</td>
                  <td className={`py-1 pr-2 text-right font-bold ${r ? COLOR[r] : ''}`}>{r ?? 'sin dato'}</td>
                  <td className="py-1 text-right">{r ? `${cifra(c.puntosDe[p.clave]!, c.puntosDe[p.clave]! % 1 ? 1 : 0)}/${p.max}` : `—/${p.max}`}</td>
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
      <p className="mt-2 text-[11px] text-suave">Nota = puntos ÷ puntos de las preguntas con respuesta × 100. Pasa el ratón por una pregunta para ver su regla.</p>
    </Tarjeta>
  )
}
