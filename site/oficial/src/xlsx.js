// Geração de .xlsx no navegador com ExcelJS (carregado sob demanda, só quando o usuário exporta).
export const carregarExcel = () => import('exceljs').then((m) => m.default || m);

export const agora = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return { txt: `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`, arq: `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}` };
};

export async function baixar(wb, nome) {
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const COR_XL = { verde: 'FF4B6B56', salvia: 'FFE6EFEA', borda: 'FFE4E3DE', div: 'FFEEEEEE', txt2: 'FF6B6B6B' };
export const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

// Exporta uma tabela simples (visão atual): bloco de título/filtros + cabeçalho + linhas + total
export async function exportarTabela({ titulo, aba, filtros, colunas, linhas, total, arquivo }) {
  const ExcelJS = await carregarExcel();
  const t = agora();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Controle de CFTV'; wb.created = new Date();
  const ws = wb.addWorksheet(aba, { properties: { defaultRowHeight: 18 } });
  ws.columns = colunas.map((c) => ({ width: c.larg || 14 }));
  ws.addRow([titulo]).font = { bold: true, size: 14, color: { argb: COR_XL.verde } };
  ws.addRow([`Gerado em ${t.txt}`]).font = { color: { argb: COR_XL.txt2 } };
  filtros.forEach(([k, v]) => { const r = ws.addRow([`${k}:`, v]); r.getCell(1).font = { bold: true }; });
  ws.addRow([]);
  const cab = ws.addRow(colunas.map((c) => c.rot));
  cab.eachCell((c, i) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill(COR_XL.verde);
    c.alignment = { vertical: 'middle', horizontal: i === 1 ? 'left' : 'center', wrapText: true };
    if (colunas[i - 1].nota) c.note = colunas[i - 1].nota;
  });
  cab.height = 32;
  const lin0 = cab.number;
  linhas.forEach((l) => ws.addRow(l).eachCell((c) => { c.border = { bottom: { style: 'thin', color: { argb: COR_XL.div } } }; }));
  if (total) { const r = ws.addRow(total); r.font = { bold: true }; r.eachCell((c) => { c.fill = fill(COR_XL.salvia); c.border = { top: { style: 'thin', color: { argb: COR_XL.verde } } }; }); }
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: lin0 }];
  ws.autoFilter = { from: { row: lin0, column: 1 }, to: { row: lin0 + linhas.length, column: colunas.length } };
  for (let i = 2; i <= colunas.length; i += 1) ws.getColumn(i).numFmt = '#,##0';
  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${lin0}:${lin0}` };
  await baixar(wb, `${arquivo}_${t.arq}.xlsx`);
}
