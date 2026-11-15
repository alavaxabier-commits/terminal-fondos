// Encaje de un fondo en cada cartera: su correlación media con ella y a quién sustituiría. Sin red.

type CarteraConFondos = { cartera: { id: number; nombre: string }; fondos: { peso: number; fondo: { isin: string; nombre: string; categoria: string | null } }[] }
export type Diversificacion = { cartera_id: number; isin: string; correlacion: number; percentil: number | null }
export type Encaje = {
  cartera: { id: number; nombre: string }; dentro: boolean; correlacion: number | null; percentil: number | null
  sustituye: { isin: string; nombre: string; peso: number } | null
}

/** `carteras`: con sus fondos de más a menos peso. `sustituye`: el de mayor peso de su misma categoría. */
export function encaje(f: { isin: string; categoria: string | null }, carteras: CarteraConFondos[], div: Diversificacion[]): Encaje[] {
  return carteras.map(({ cartera, fondos }) => {
    const d = div.find((x) => x.cartera_id === cartera.id && x.isin === f.isin)
    const mismo = f.categoria ? fondos.find((x) => x.fondo.categoria === f.categoria && x.fondo.isin !== f.isin) : undefined
    return {
      cartera, dentro: fondos.some((x) => x.fondo.isin === f.isin), correlacion: d?.correlacion ?? null, percentil: d?.percentil ?? null,
      sustituye: mismo ? { isin: mismo.fondo.isin, nombre: mismo.fondo.nombre, peso: mismo.peso } : null,
    }
  })
}
