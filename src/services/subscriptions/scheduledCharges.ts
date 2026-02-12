import { db } from "../../data/db";
import { localIsoDate } from "../../domain/calculations";
import type { Subscription, Transaction } from "../../domain/models";

const SCHEDULE_PREFIX = "scheduled-subscription:";
const SCHEDULE_NOTE_PREFIX = "Subscription charge";

function addMonths(dateIso: string, monthsToAdd: number) {
  const [year, month, day] = dateIso.split("-").map((part) => Number(part));
  const dt = new Date(year, month - 1 + monthsToAdd, day);
  return localIsoDate(dt);
}

function chargeMonthsForFrequency(frequency: Subscription["frequency"], horizonMonths: number) {
  if (frequency === "monthly") return Array.from({ length: horizonMonths }, (_, idx) => idx);
  if (frequency === "quarterly") return Array.from({ length: Math.ceil(horizonMonths / 3) }, (_, idx) => idx * 3);
  return [0];
}

function scheduledId(subscriptionId: string, offsetMonths: number) {
  return `${SCHEDULE_PREFIX}${subscriptionId}:${offsetMonths}`;
}

function buildScheduledTransactions(subscription: Subscription, horizonMonths = 12): Transaction[] {
  const offsets = chargeMonthsForFrequency(subscription.frequency, horizonMonths);
  return offsets.map((offset) => ({
    id: scheduledId(subscription.id, offset),
    date: addMonths(subscription.nextDueDate, offset),
    amount: subscription.cost,
    type: "expense",
    category: subscription.category || "Subscription",
    merchant: subscription.name,
    account: subscription.accountId || "unassigned",
    note: `${SCHEDULE_NOTE_PREFIX}: ${subscription.id}`,
    recurring: 1
  }));
}

export async function clearScheduledChargesForSubscription(subscriptionId: string) {
  const all = await db.listTransactions();
  const linked = all.filter(
    (tx) =>
      tx.id.startsWith(`${SCHEDULE_PREFIX}${subscriptionId}:`) ||
      tx.note === `${SCHEDULE_NOTE_PREFIX}: ${subscriptionId}`
  );
  await Promise.all(linked.map((tx) => db.deleteTransaction(tx.id)));
}

export async function syncScheduledChargesForSubscription(subscription: Subscription) {
  await clearScheduledChargesForSubscription(subscription.id);
  if (!subscription.isActive || subscription.cost <= 0 || !subscription.nextDueDate) return;
  const scheduled = buildScheduledTransactions(subscription);
  await Promise.all(scheduled.map((tx) => db.upsertTransaction(tx)));
}


