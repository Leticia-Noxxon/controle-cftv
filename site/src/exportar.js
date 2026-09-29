// Exportação para Excel (SheetJS). Cada chamada gera um arquivo com uma aba de informações + as abas pedidas.
import * as XLSX from 'xlsx';
import { descreverFiltros } from './main.js';

export function exportarXlsx(nome, abas, descricao = '') {
  const wb = XLSX.utils.book_new();
  const info = [{ Item: 'Gerado em', Valor: new Date().toLocaleString('pt-BR') }, { Item: 'Conteúdo', Valor: descricao }, { Item: 'Filtros', Valor: descreverFiltros() }];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(info), 'Informações');
  Object.entries(abas).forEach(([n, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Aviso: 'Sem dados para os filtros' }]), n.slice(0, 31)));
  XLSX.writeFile(wb, `${nome}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
