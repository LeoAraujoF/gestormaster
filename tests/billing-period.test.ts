import assert from "node:assert/strict"
import test from "node:test"

import {
  billingCreditsBetween,
  calculateBillingTotals,
  monthlyPlanValueFromPayment,
} from "../src/lib/billing-period"

test("preserva o valor pago e multiplica apenas as despesas do período", () => {
  const credits = billingCreditsBetween("2026-07-31", "2026-09-30")
  const totals = calculateBillingTotals({
    amountPaid: 45,
    monthlyServiceCost: 8,
    screens: 1,
    credits,
  })

  assert.equal(credits, 2)
  assert.deepEqual(totals, {
    amountPaid: 45,
    credits: 2,
    totalCost: 16,
    netProfit: 29,
  })
})

test("não adiciona outro crédito ao alterar apenas o dia", () => {
  assert.equal(billingCreditsBetween("2026-08-01", "2026-09-01"), 1)
  assert.equal(billingCreditsBetween("2026-08-01", "2026-09-02"), 1)
  assert.equal(billingCreditsBetween("2026-09-01", "2026-09-02"), 1)
})

test("cada mês de calendário acrescenta exatamente um crédito", () => {
  assert.equal(billingCreditsBetween("2026-08-01", "2026-10-02"), 2)
  assert.equal(billingCreditsBetween("2026-08-31", "2026-09-01"), 1)
  assert.equal(billingCreditsBetween("2026-12-31", "2027-01-01"), 1)
  assert.equal(billingCreditsBetween("2026-12-31", "2027-02-01"), 2)
})

test("deriva o valor mensal sem alterar o pagamento recebido", () => {
  assert.equal(monthlyPlanValueFromPayment(45, 2), 22.5)
  assert.equal(monthlyPlanValueFromPayment(45, 0), 45)
})

test("considera telas na despesa, não na receita", () => {
  const totals = calculateBillingTotals({ amountPaid: 45, monthlyServiceCost: 8, screens: 2, credits: 2 })
  assert.equal(totals.amountPaid, 45)
  assert.equal(totals.totalCost, 32)
  assert.equal(totals.netProfit, 13)
})
