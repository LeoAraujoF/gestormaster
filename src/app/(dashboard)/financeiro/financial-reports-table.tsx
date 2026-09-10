"use client"

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowUpDown, ChevronLeft, ChevronRight, Columns3, ExternalLink } from "lucide-react"
import Link from "next/link"
import { useMemo, useState, type ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn, formatCurrency } from "@/lib/utils"

import {
  clientStatusLabels,
  financialPaymentDate,
  financialPaymentMethodLabel,
  financialPaymentServices,
  type FinancialReportPayment,
} from "./financial-report-types"

type FinancialReportsTableProps = {
  data: FinancialReportPayment[]
  displayValue: (value: string | number) => ReactNode
}

const columnLabels: Record<string, string> = {
  date: "Data",
  client: "Cliente",
  category: "Serviço",
  type: "Tipo",
  paymentMethod: "Pagamento",
  status: "Status",
  amount: "Valor",
}

export function FinancialReportsTable({ data, displayValue }: FinancialReportsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  const columns = useMemo<ColumnDef<FinancialReportPayment>[]>(() => [
    {
      id: "select",
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(checked) => table.toggleAllPageRowsSelected(Boolean(checked))}
          aria-label="Selecionar pagamentos desta página"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
          aria-label={`Selecionar pagamento de ${row.original.clients?.name || "cliente não identificado"}`}
        />
      ),
    },
    {
      id: "date",
      accessorFn: (payment) => financialPaymentDate(payment).getTime(),
      header: "Data",
      cell: ({ row }) => (
        <span className="num whitespace-nowrap text-xs text-muted-foreground">
          {format(financialPaymentDate(row.original), "dd/MM/yyyy HH:mm", { locale: ptBR })}
        </span>
      ),
    },
    {
      id: "client",
      accessorFn: (payment) => payment.clients?.name || "",
      header: "Cliente",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="max-w-48 truncate text-[13px] font-semibold text-foreground">{row.original.clients?.name || "Não identificado"}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Receita confirmada</p>
        </div>
      ),
    },
    {
      id: "category",
      accessorFn: (payment) => financialPaymentServices(payment).map((service) => service.name).join(", "),
      header: "Serviço",
      cell: ({ row }) => {
        const services = financialPaymentServices(row.original)
        return <span className="block max-w-40 truncate text-xs text-foreground">{services.map((service) => service.name).join(", ") || "Sem serviço"}</span>
      },
    },
    {
      id: "type",
      accessorFn: (payment) => payment.amount_paid === 0 ? "promotion" : "income",
      header: "Tipo",
      cell: ({ row }) => (
        <Badge className={cn(
          "rounded border-0 px-1.5 text-[10px] font-semibold",
          row.original.amount_paid === 0 ? "bg-secondary text-muted-foreground" : "bg-success-bg text-success-fg",
        )}>
          {row.original.amount_paid === 0 ? "Promoção" : "Receita"}
        </Badge>
      ),
    },
    {
      id: "paymentMethod",
      accessorFn: (payment) => financialPaymentMethodLabel(payment.payment_method),
      header: "Pagamento",
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{financialPaymentMethodLabel(row.original.payment_method)}</span>,
    },
    {
      id: "status",
      accessorFn: (payment) => payment.clients?.status || "",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.clients?.status
        return (
          <span className={cn(
            "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
            status === "active" && "bg-success-bg text-success-fg",
            status === "vencido" && "bg-danger-bg text-danger-fg",
            status === "pending" && "bg-warning-bg text-warning-fg",
            (!status || ["inactive", "suspended", "canceled"].includes(status)) && "bg-secondary text-muted-foreground",
          )}>
            {status ? clientStatusLabels[status] : "Não identificado"}
          </span>
        )
      },
    },
    {
      id: "amount",
      accessorFn: (payment) => Number(payment.amount_paid || 0),
      header: "Valor",
      cell: ({ row }) => (
        <span className="num whitespace-nowrap text-xs font-semibold text-money">
          {displayValue(formatCurrency(Number(row.original.amount_paid || 0)))}
        </span>
      ),
    },
    {
      id: "actions",
      enableSorting: false,
      enableHiding: false,
      header: "Ações",
      cell: ({ row }) => {
        const clientName = row.original.clients?.name
        return clientName ? (
          <Link
            href={`/clientes?q=${encodeURIComponent(clientName)}`}
            aria-label={`Abrir ${clientName} em Clientes`}
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null
      },
    },
  ], [displayValue])

  // TanStack Table mantém estado próprio e, por isso, não é memoizado pelo
  // React Compiler. A tabela continua controlada pelos estados acima.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getRowId: (payment) => payment.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: true,
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
  })

  const pageRows = table.getRowModel().rows
  const selectedCount = table.getSelectedRowModel().rows.length

  if (data.length === 0) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 text-center">
        <p className="text-sm font-semibold text-foreground">Nenhuma movimentação encontrada</p>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">Ajuste os filtros ou escolha outro período para consultar os pagamentos.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-foreground">{data.length} {data.length === 1 ? "movimentação" : "movimentações"}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{selectedCount > 0 ? `${selectedCount} selecionada${selectedCount === 1 ? "" : "s"}` : "Ordene as colunas ou personalize a visualização."}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "gap-2",
            })}
          >
            <Columns3 className="size-4" aria-hidden="true" /> Colunas
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {table.getAllLeafColumns().filter((column) => column.getCanHide()).map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(checked) => column.toggleVisibility(Boolean(checked))}
              >
                {columnLabels[column.id] || column.id}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="lg:hidden">
        <div className="divide-y divide-border">
          {pageRows.map((row) => {
            const payment = row.original
            const services = financialPaymentServices(payment)
            return (
              <article key={payment.id} className={cn("space-y-3 p-4", row.getIsSelected() && "bg-interactive-bg/50")}>
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
                    aria-label={`Selecionar pagamento de ${payment.clients?.name || "cliente não identificado"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{payment.clients?.name || "Não identificado"}</p>
                        <p className="num mt-1 text-[10px] text-muted-foreground">{format(financialPaymentDate(payment), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                      </div>
                      <p className="num shrink-0 text-sm font-semibold text-money">{displayValue(formatCurrency(Number(payment.amount_paid || 0)))}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{financialPaymentMethodLabel(payment.payment_method)}</span>
                      <span aria-hidden="true">•</span>
                      <span>{services.map((service) => service.name).join(", ") || "Sem serviço"}</span>
                    </div>
                  </div>
                </div>
                {payment.clients?.name ? (
                  <Link
                    href={`/clientes?q=${encodeURIComponent(payment.clients.name)}`}
                    className={buttonVariants({ variant: "outline", size: "sm", className: "w-full gap-2" })}
                  >
                    Abrir cliente <ExternalLink className="size-3.5" aria-hidden="true" />
                  </Link>
                ) : null}
              </article>
            )
          })}
        </div>
      </div>

      <div className="hidden max-h-[560px] overflow-auto lg:block">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap text-[10px]">
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="flex min-h-9 items-center gap-1.5 rounded-md font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <ArrowUpDown className="size-3 text-muted-foreground" aria-hidden="true" />
                      </button>
                    ) : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 border-t border-border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Itens por página
          <select
            value={table.getState().pagination.pageSize}
            onChange={(event) => table.setPageSize(Number(event.target.value))}
            className="h-9 rounded-lg border border-input bg-card px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronLeft className="size-4" aria-hidden="true" /> Anterior
          </Button>
          <span className="num min-w-20 text-center text-xs text-muted-foreground">{table.getState().pagination.pageIndex + 1} de {table.getPageCount()}</span>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Próxima <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}
