// Marca "OS" (Ordem de Serviço): selo quadrado arredondado em degradê azul → índigo; o "O" é uma lente de câmera
// (anel + pupila com brilho) e o "S" é desenhado em traço contínuo. Mesmo desenho no favicon (index.html).
let n = 0;
export function logoOS(cls = 'logo-os', titulo = 'OS · Controle CFTV') {
  const id = `os${(n += 1)}`;
  return `<svg class="${cls}" viewBox="0 0 40 40" role="img" aria-label="${titulo}"><title>${titulo}</title>
  <defs><linearGradient id="${id}g" x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3b82f6"/><stop offset=".55" stop-color="#2563eb"/><stop offset="1" stop-color="#4f46e5"/></linearGradient>
  <linearGradient id="${id}h" x1="20" y1="0" x2="20" y2="30" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".24"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
  <rect width="40" height="40" rx="11" fill="url(#${id}g)"/><rect width="40" height="40" rx="11" fill="url(#${id}h)"/><rect x=".3" y=".3" width="39.4" height="39.4" rx="10.7" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width=".6"/>
  <circle cx="13.6" cy="20" r="6.4" fill="none" stroke="#fff" stroke-width="3.1"/><circle cx="13.6" cy="20" r="2.1" fill="#fff" fill-opacity=".92"/><circle cx="14.6" cy="19" r=".7" fill="#2563eb"/>
  <path d="M31.2 15.3c-.8-1.3-2.3-2-4-2-2.4 0-4 1.3-4 3.1 0 4.4 8.3 2.6 8.3 7.2 0 2-1.8 3.3-4.3 3.3-1.9 0-3.5-.8-4.3-2.2" fill="none" stroke="#fff" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
