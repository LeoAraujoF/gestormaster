import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

import { formatCurrency } from "@/lib/utils"

import {
  clientStatusLabels,
  financialPaymentDate,
  financialPaymentMethodLabel,
  financialPaymentServices,
  type FinancialReportFilters,
  type FinancialReportPayment,
  type FinancialReportSummary,
} from "./financial-report-types"

export type FinancialReportExportContext = {
  filters: FinancialReportFilters
  periodLabel: string
  serviceLabel: string
  summary: FinancialReportSummary
  payments: FinancialReportPayment[]
}

function generatedAt() {
  return format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

function fileDate() {
  return format(new Date(), "yyyy-MM-dd")
}

function filterRows(context: FinancialReportExportContext) {
  return [
    ["Período", context.periodLabel],
    ["Status", context.filters.status === "all" ? "Todos" : clientStatusLabels[context.filters.status]],
    ["Forma de pagamento", context.filters.paymentMethod === "all" ? "Todas" : financialPaymentMethodLabel(context.filters.paymentMethod)],
    ["Serviço", context.serviceLabel],
    ["Busca", context.filters.search || "Sem busca"],
  ]
}

function summaryRows(summary: FinancialReportSummary) {
  return [
    ["Movimentações", summary.payments],
    ["Clientes com pagamento", summary.clients],
    ["Receita", formatCurrency(summary.revenue)],
    ["Custos", formatCurrency(summary.costs)],
    ["Lucro líquido", formatCurrency(summary.netProfit)],
    ["Ticket médio", formatCurrency(summary.averageTicket)],
  ]
}

function movementRows(payments: FinancialReportPayment[]) {
  return payments.map((payment) => ({
    Data: financialPaymentDate(payment),
    Cliente: payment.clients?.name || "Não identificado",
    Serviço: financialPaymentServices(payment).map((service) => service.name).join(", ") || "Sem serviço",
    Tipo: payment.amount_paid === 0 ? "Promoção" : "Receita",
    "Forma de pagamento": financialPaymentMethodLabel(payment.payment_method),
    Status: payment.clients?.status ? clientStatusLabels[payment.clients.status] : "Não identificado",
    Valor: Number(payment.amount_paid || 0),
    "Lucro líquido": Number(payment.net_profit || 0),
  }))
}

export async function exportFinancialReportToPdf(context: FinancialReportExportContext) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ])

  const document = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  document.setFont("helvetica", "bold")
  document.setFontSize(17)
  document.text("Relatório financeiro", 14, 16)
  document.setFont("helvetica", "normal")
  document.setFontSize(9)
  document.setTextColor(90)
  document.text(`Gerado em ${generatedAt()} • ${context.periodLabel}`, 14, 22)

  autoTable(document, {
    startY: 28,
    head: [["Filtro", "Valor"]],
    body: filterRows(context),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [50, 60, 75] },
    tableWidth: 125,
  })

  autoTable(document, {
    startY: 28,
    margin: { left: 145 },
    head: [["Indicador", "Resultado"]],
    body: summaryRows(context.summary),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [46, 125, 84] },
    tableWidth: 135,
  })

  const tableRows = movementRows(context.payments).map((movement) => [
    format(movement.Data, "dd/MM/yyyy HH:mm", { locale: ptBR }),
    movement.Cliente,
    movement.Serviço,
    movement.Tipo,
    movement["Forma de pagamento"],
    movement.Status,
    formatCurrency(movement.Valor),
    formatCurrency(movement["Lucro líquido"]),
  ])

  autoTable(document, {
    startY: 70,
    head: [["Data", "Cliente", "Serviço", "Tipo", "Pagamento", "Status", "Valor", "Lucro líquido"]],
    body: tableRows,
    theme: "striped",
    styles: { fontSize: 7.5, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [35, 40, 50] },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 42 },
      2: { cellWidth: 42 },
      3: { cellWidth: 22 },
      4: { cellWidth: 28 },
      5: { cellWidth: 24 },
      6: { cellWidth: 28, halign: "right" },
      7: { cellWidth: 28, halign: "right" },
    },
    margin: { top: 14, right: 10, bottom: 14, left: 10 },
  })

  const pages = document.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    document.setPage(page)
    document.setFont("helvetica", "bold")
    document.setFontSize(7.5)
    document.setTextColor(80)
    document.text("Lembrado • Relatório financeiro", 10, 7)
    document.setFont("helvetica", "normal")
    document.setFontSize(8)
    document.setTextColor(110)
    document.text(`Lembrado • Relatório financeiro`, 10, 204)
    document.text(`Página ${page} de ${pages}`, 276, 204, { align: "right" })
  }

  document.save(`relatorio-financeiro-${fileDate()}.pdf`)
}

export async function exportFinancialReportToExcel(context: FinancialReportExportContext) {
  const [XLSX, { strFromU8, strToU8, unzipSync, zipSync }] = await Promise.all([
    import("xlsx"),
    import("fflate"),
  ])
  const workbook = XLSX.utils.book_new()
  const summaryData: Array<Array<string | number>> = [
    ["Relatório financeiro"],
    ["Gerado em", generatedAt()],
    ...filterRows(context),
    [],
    ["Indicador", "Resultado"],
    ["Movimentações", context.summary.payments],
    ["Clientes com pagamento", context.summary.clients],
    ["Receita", context.summary.revenue],
    ["Custos", context.summary.costs],
    ["Lucro líquido", context.summary.netProfit],
    ["Ticket médio", context.summary.averageTicket],
  ]
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
  summarySheet["!cols"] = [{ wch: 28 }, { wch: 34 }]
  summarySheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]
  for (const address of ["B12", "B13", "B14", "B15"]) {
    if (summarySheet[address]) summarySheet[address].z = '"R$" #,##0.00'
  }
  for (const address of ["A1", "A9", "B9"]) {
    if (summarySheet[address]) {
      summarySheet[address].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "232832" } },
      }
    }
  }

  const movements = movementRows(context.payments)
  const movementSheet = XLSX.utils.json_to_sheet(movements, {
    header: ["Data", "Cliente", "Serviço", "Tipo", "Forma de pagamento", "Status", "Valor", "Lucro líquido"],
    cellDates: true,
  })
  movementSheet["!cols"] = [
    { wch: 20 },
    { wch: 30 },
    { wch: 28 },
    { wch: 14 },
    { wch: 22 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
  ]
  if (movementSheet["!ref"]) movementSheet["!autofilter"] = { ref: movementSheet["!ref"] }
  for (const address of ["A1", "B1", "C1", "D1", "E1", "F1", "G1", "H1"]) {
    if (movementSheet[address]) {
      movementSheet[address].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "232832" } },
      }
    }
  }
  for (let row = 2; row <= movements.length + 1; row += 1) {
    if (movementSheet[`A${row}`]) movementSheet[`A${row}`].z = "dd/mm/yyyy hh:mm"
    if (movementSheet[`G${row}`]) movementSheet[`G${row}`].z = '"R$" #,##0.00'
    if (movementSheet[`H${row}`]) movementSheet[`H${row}`].z = '"R$" #,##0.00'
  }

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumo")
  XLSX.utils.book_append_sheet(workbook, movementSheet, "Movimentações")
  const workbookBytes = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
    compression: true,
    cellStyles: true,
  }) as ArrayBuffer

  // SheetJS Community Edition preserva os formatos e o autofiltro, mas ignora
  // estilos visuais na gravação. Aplicamos apenas o destaque dos cabeçalhos no
  // XML final para que ele também apareça ao abrir o arquivo no Excel.
  const archive = unzipSync(new Uint8Array(workbookBytes))
  const parser = new DOMParser()
  const serializer = new XMLSerializer()
  const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  const styles = parser.parseFromString(strFromU8(archive["xl/styles.xml"]), "application/xml")
  const fonts = styles.getElementsByTagNameNS(namespace, "fonts")[0]
  const fills = styles.getElementsByTagNameNS(namespace, "fills")[0]
  const cellFormats = styles.getElementsByTagNameNS(namespace, "cellXfs")[0]
  const headerStyleIndex = cellFormats.children.length

  const headerFont = styles.createElementNS(namespace, "font")
  headerFont.append(styles.createElementNS(namespace, "b"))
  const fontColor = styles.createElementNS(namespace, "color")
  fontColor.setAttribute("rgb", "FFFFFFFF")
  headerFont.append(fontColor)
  const fontSize = styles.createElementNS(namespace, "sz")
  fontSize.setAttribute("val", "12")
  headerFont.append(fontSize)
  const fontName = styles.createElementNS(namespace, "name")
  fontName.setAttribute("val", "Calibri")
  headerFont.append(fontName)
  fonts.append(headerFont)
  fonts.setAttribute("count", String(fonts.children.length))

  const headerFill = styles.createElementNS(namespace, "fill")
  const patternFill = styles.createElementNS(namespace, "patternFill")
  patternFill.setAttribute("patternType", "solid")
  const foreground = styles.createElementNS(namespace, "fgColor")
  foreground.setAttribute("rgb", "FF232832")
  const background = styles.createElementNS(namespace, "bgColor")
  background.setAttribute("indexed", "64")
  patternFill.append(foreground, background)
  headerFill.append(patternFill)
  fills.append(headerFill)
  fills.setAttribute("count", String(fills.children.length))

  const headerFormat = styles.createElementNS(namespace, "xf")
  headerFormat.setAttribute("numFmtId", "0")
  headerFormat.setAttribute("fontId", String(fonts.children.length - 1))
  headerFormat.setAttribute("fillId", String(fills.children.length - 1))
  headerFormat.setAttribute("borderId", "0")
  headerFormat.setAttribute("xfId", "0")
  headerFormat.setAttribute("applyFont", "1")
  headerFormat.setAttribute("applyFill", "1")
  headerFormat.setAttribute("applyAlignment", "1")
  const alignment = styles.createElementNS(namespace, "alignment")
  alignment.setAttribute("horizontal", "left")
  alignment.setAttribute("vertical", "center")
  headerFormat.append(alignment)
  cellFormats.append(headerFormat)
  cellFormats.setAttribute("count", String(cellFormats.children.length))
  archive["xl/styles.xml"] = strToU8(serializer.serializeToString(styles))

  const highlightCells = (worksheetPath: string, references: string[]) => {
    const worksheet = parser.parseFromString(strFromU8(archive[worksheetPath]), "application/xml")
    const cells = Array.from(worksheet.getElementsByTagNameNS(namespace, "c"))
    for (const cell of cells) {
      if (references.includes(cell.getAttribute("r") ?? "")) {
        cell.setAttribute("s", String(headerStyleIndex))
      }
    }
    archive[worksheetPath] = strToU8(serializer.serializeToString(worksheet))
  }

  highlightCells("xl/worksheets/sheet1.xml", ["A1", "A9", "B9"])
  highlightCells("xl/worksheets/sheet2.xml", ["A1", "B1", "C1", "D1", "E1", "F1", "G1", "H1"])

  const output = zipSync(archive, { level: 6 })
  const url = URL.createObjectURL(
    new Blob([output as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  )
  const link = document.createElement("a")
  link.href = url
  link.download = `relatorio-financeiro-${fileDate()}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}
