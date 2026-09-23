"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

export type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, ChevronDown, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  searchKey?: string;
  totalItems?: number;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onSearch?: (value: string) => void;
  enableSelection?: boolean;
  actions?: (row: TData) => Array<{ label: string; onClick: () => void; icon?: React.ReactNode; destructive?: boolean }>;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = "Search...",
  searchKey,
  totalItems,
  page = 1,
  totalPages = 1,
  onPageChange,
  onSearch,
  enableSelection = false,
  actions,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [searchValue, setSearchValue] = React.useState("");

  const allColumns = React.useMemo(() => {
    const cols = [...columns];
    if (enableSelection) {
      cols.unshift({
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      } as ColumnDef<TData, TValue>);
    }
    if (actions) {
      cols.push({
        id: "actions",
        enableHiding: false,
        header: () => null,
        cell: ({ row }) => {
          const rowActions = actions(row.original);
          if (rowActions.length === 0) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {rowActions.map((action, index) => (
                  <DropdownMenuItem
                    key={index}
                    onClick={action.onClick}
                    className={cn(action.destructive && "text-destructive")}
                  >
                    {action.icon && <span className="me-2">{action.icon}</span>}
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      } as ColumnDef<TData, TValue>);
    }
    return cols;
  }, [columns, enableSelection, actions]);

  const isServerPaginated = !!onPageChange;

  const table = useReactTable({
    data,
    columns: allColumns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    ...(isServerPaginated
      ? { manualPagination: true, pageCount: totalPages }
      : { getPaginationRowModel: getPaginationRowModel() }),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      ...(isServerPaginated
        ? { pagination: { pageIndex: (page ?? 1) - 1, pageSize: data.length || 1 } }
        : {}),
    },
  });

  const handleSearch = (value: string) => {
    setSearchValue(value);
    if (searchKey) {
      table.getColumn(searchKey)?.setFilterValue(value);
    }
    onSearch?.(value);
  };

  return (
    <div className="w-full space-y-4">
      {(searchKey || onSearch) && (
        <div className="flex items-center gap-2">
          <Input
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => handleSearch(e.target.value)}
            className="max-w-sm"
          />
          {table.getAllColumns().filter((col) => col.getCanHide()).length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Columns <ChevronDown className="ms-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {table
                  .getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => (
                    <DropdownMenuItem
                      key={column.id}
                      onClick={() => column.toggleVisibility(!column.getIsVisible())}
                    >
                      <Checkbox
                        checked={column.getIsVisible()}
                        className="me-2"
                      />
                      {column.id}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={allColumns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {totalItems !== undefined && `${totalItems} total`}
          {Object.keys(rowSelection).length > 0 && ` | ${Object.keys(rowSelection).length} selected`}
        </p>
        {onPageChange && totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
        )}
      </div>
    </div>
  );
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: ReturnType<typeof useReactTable<TData>>["getColumn"] extends (id: string) => infer R
    ? NonNullable<R>
    : never;
  title: string;
  className?: string;
}) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <Button
        variant="ghost"
        size="sm"
        className="-ms-3 h-8 data-[state=open]:bg-accent"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        <span>{title}</span>
        <ArrowUpDown className="ms-2 h-4 w-4" />
      </Button>
    </div>
  );
}
