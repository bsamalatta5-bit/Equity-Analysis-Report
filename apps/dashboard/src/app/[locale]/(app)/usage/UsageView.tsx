"use client";

import { useQuery } from "@tanstack/react-query";
import { useI18n } from "../../../../lib/i18n/provider";
import { useCurrentSession } from "../../../../lib/auth/session-context";
import { getUsage } from "../../../../lib/usage/api";
import { Card } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { AsyncStateView } from "../../../../components/states/AsyncStateView";

export function UsageView() {
  const { t, locale } = useI18n();
  const session = useCurrentSession();
  const usageQuery = useQuery({
    queryKey: ["usage", session.tenantId],
    queryFn: () => getUsage(session.tenantId),
  });

  return (
    <div className="flex flex-col gap-token-6">
      <h1 className="text-xl font-semibold text-text-primary">{t("usage.title")}</h1>
      <AsyncStateView
        isLoading={usageQuery.isLoading}
        isError={usageQuery.isError}
        error={usageQuery.error}
        data={usageQuery.data}
        isEmpty={(data) => data.usageRecords.length === 0 && !data.subscription}
        onRetry={() => void usageQuery.refetch()}
      >
        {(usage) => (
          <div className="flex flex-col gap-token-4">
            <Card>
              <h2 className="text-sm font-semibold text-text-primary">{t("usage.subscriptionTitle")}</h2>
              {usage.subscription ? (
                <dl className="mt-token-3 grid grid-cols-2 gap-token-2 text-sm">
                  <dt className="text-text-secondary">{t("usage.planLabel")}</dt>
                  <dd className="font-medium text-text-primary">{usage.subscription.planCode}</dd>
                  <dt className="text-text-secondary">{t("usage.subscriptionStatusLabel")}</dt>
                  <dd>
                    <Badge tone={usage.subscription.status === "active" ? "success" : "neutral"}>
                      {usage.subscription.status}
                    </Badge>
                  </dd>
                  <dt className="text-text-secondary">{t("usage.includedMinutesLabel")}</dt>
                  <dd className="font-medium text-text-primary">{usage.subscription.includedMinutes}</dd>
                  <dt className="text-text-secondary">{t("usage.spendCapLabel")}</dt>
                  <dd className="font-medium text-text-primary">
                    {usage.subscription.monthlySpendCapCents !== null
                      ? (usage.subscription.monthlySpendCapCents / 100).toLocaleString(locale, {
                          style: "currency",
                          currency: "SAR",
                        })
                      : t("usage.spendCapNone")}
                  </dd>
                </dl>
              ) : (
                <p className="mt-token-3 text-sm text-text-secondary">{t("usage.noSubscription")}</p>
              )}
            </Card>

            <Card>
              <h2 className="text-sm font-semibold text-text-primary">{t("usage.historyTitle")}</h2>
              {usage.usageRecords.length === 0 ? (
                <p className="mt-token-3 text-sm text-text-secondary">{t("usage.noUsageRecords")}</p>
              ) : (
                <table className="mt-token-3 w-full text-start text-sm">
                  <thead>
                    <tr className="border-b border-border text-text-secondary">
                      <th scope="col" className="py-token-2 text-start font-medium">
                        {t("usage.periodLabel")}
                      </th>
                      <th scope="col" className="py-token-2 text-start font-medium">
                        {t("usage.billableMinutesLabel")}
                      </th>
                      <th scope="col" className="py-token-2 text-start font-medium">
                        {t("usage.overageMinutesLabel")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.usageRecords.map((record) => (
                      <tr key={record.id} className="border-b border-border last:border-0">
                        <td className="py-token-2">
                          {new Date(record.periodStart).toLocaleDateString(locale, {
                            year: "numeric",
                            month: "long",
                          })}
                        </td>
                        <td className="py-token-2">{record.billableMinutes}</td>
                        <td className="py-token-2">{record.overageMinutes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        )}
      </AsyncStateView>
    </div>
  );
}
