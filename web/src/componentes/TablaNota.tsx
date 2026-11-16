import { cifra } from '../calculo/formato'
import { BLOQUES, NOMBRE_BLOQUE, pesosEfectivos, type Bloque, type Pesos } from '../calculo/nota'

/** Por qué una nota: percentil, peso efectivo y aportación de cada bloque, y los bloques flojos (percentil < 40). */
export default function TablaNota({ bloques, pesos, nota }: { bloques: Partial<Record<Bloque, number>>; pesos: Pesos; nota: number }) {
  const w = pesosEfectivos(bloques, pesos)
  const flojos = BLOQUES.filter((k) => w[k] && bloques[k]! < 40).map((k) => `${NOMBRE_BLOQUE[k].toLowerCase()} (percentil ${Math.round(bloques[k]!)})`)
  return (
    <>
      <table className="w-full text-right tabular [&_tr>*+*]:pl-2">
        <thead className="rotulo">
          <tr><th className="py-0.5 text-left font-normal">Bloque</th><th className="font-normal">Pct.</th><th className="font-normal">Peso</th><th className="font-normal">Pone</th></tr>
        </thead>
        <tbody>
          {BLOQUES.map((k) => (
            <tr key={k} className={`border-t border-borde/50 ${w[k] == null ? 'text-suave' : bloques[k]! < 40 ? 'text-aviso' : ''}`}>
              <td className="py-0.5 text-left">{NOMBRE_BLOQUE[k]}</td>
              <td>{bloques[k] == null ? '—' : Math.round(bloques[k]!)}</td>
              <td>{w[k] == null ? '0 %' : `${cifra(w[k]! * 100, 1)} %`}</td>
              <td>{w[k] == null ? '—' : cifra(w[k]! * bloques[k]!, 1)}</td>
            </tr>
          ))}
          <tr className="border-t border-borde text-acento"><td className="py-0.5 text-left">Nota</td><td /><td>100 %</td><td>{cifra(nota, 1)}</td></tr>
        </tbody>
      </table>
      {flojos.length > 0 && <p className="text-suave">Lo flojo: {flojos.join(', ')}.</p>}
    </>
  )
}
