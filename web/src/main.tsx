import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { leerTema, ponerTema } from './componentes/tema'
import './estilos.css'

ponerTema(leerTema()) // antes de pintar, para no ver el otro tema un instante

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
