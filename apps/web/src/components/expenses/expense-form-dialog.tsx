"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocalization } from "@/hooks/use-localization";
import {
  useCreateExpense,
  useUpdateExpense,
  type Expense,
} from "@/hooks/api/use-expenses";

const PAYMENT_METHODS = ["CASH", "CARD", "TRANSFER", "OTHER"] as const;

function toDateInput(value?: string | null): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

export interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: Expense | null;
}

export function ExpenseFormDialog({ open, onOpenChange, expense }: ExpenseFormDialogProps) {
  const { t } = useLocalization();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const isEdit = Boolean(expense?.id);

  const [category, setCategory] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [currency, setCurrency] = React.useState("USD");
  const [paymentMethod, setPaymentMethod] = React.useState<string>("CASH");
  const [incurredAt, setIncurredAt] = React.useState(() => toDateInput());
  const [description, setDescription] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    if (expense) {
      setCategory(expense.category || "");
      setAmount(expense.amount != null ? String(expense.amount) : "");
      setCurrency(expense.currency || "USD");
      setPaymentMethod(expense.paymentMethod || "CASH");
      setIncurredAt(toDateInput(expense.incurredAt));
      setDescription(expense.description || "");
    } else {
      setCategory("");
      setAmount("");
      setCurrency("USD");
      setPaymentMethod("CASH");
      setIncurredAt(toDateInput());
      setDescription("");
    }
  }, [open, expense]);

  const isPending = createExpense.isPending || updateExpense.isPending;
  const valid = category.trim() !== "" && amount !== "" && !Number.isNaN(Number(amount)) && Number(amount) >= 0;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || isPending) return;
    const payload = {
      category: category.trim(),
      amount: Number(amount),
      currency: currency.trim().toUpperCase() || "USD",
      paymentMethod: paymentMethod || null,
      incurredAt,
      description: description.trim() || null,
    };
    if (isEdit && expense) {
      updateExpense.mutate(
        { id: expense.id, input: payload },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      createExpense.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? t("expensesPages.form.editTitle") : t("expensesPages.form.createTitle")}
            </DialogTitle>
            <DialogDescription>{t("expensesPages.form.description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="expense-category">{t("expensesPages.form.category")}</Label>
            <Input
              id="expense-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder={t("expensesPages.form.categoryPlaceholder")}
              maxLength={120}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="expense-amount">{t("expensesPages.form.amount")}</Label>
              <Input
                id="expense-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-currency">{t("expensesPages.form.currency")}</Label>
              <Input
                id="expense-currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                maxLength={8}
                placeholder="USD"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("expensesPages.form.paymentMethod")}</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {t(`expensesPages.paymentMethods.${method}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-date">{t("expensesPages.form.date")}</Label>
              <Input
                id="expense-date"
                type="date"
                value={incurredAt}
                onChange={(event) => setIncurredAt(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-description">{t("expensesPages.form.notes")}</Label>
            <Textarea
              id="expense-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("expensesPages.form.notesPlaceholder")}
              maxLength={500}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!valid || isPending}>
              {isPending ? t("expensesPages.form.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
