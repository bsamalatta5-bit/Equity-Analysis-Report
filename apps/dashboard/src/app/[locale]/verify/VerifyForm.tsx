"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Locale } from "../../../lib/i18n/locales";
import { useI18n } from "../../../lib/i18n/provider";
import { confirmTotpEnrollment, startTotpEnrollment, verifyTotp } from "../../../lib/auth/api";
import { SESSION_QUERY_KEY } from "../../../lib/auth/use-session";
import { ApiError, NetworkError } from "../../../lib/api/client";
import { Button } from "../../../components/ui/Button";
import { TextField } from "../../../components/ui/TextField";
import { Card } from "../../../components/ui/Card";
import { AsyncStateView } from "../../../components/states/AsyncStateView";

interface CodeFormValues {
  code: string;
}

export function VerifyForm({
  locale,
  challengeToken,
  mode,
}: {
  locale: Locale;
  challengeToken: string;
  mode: "verify" | "enroll";
}) {
  const enrollment = useQuery({
    queryKey: ["totp-enrollment", challengeToken],
    queryFn: () => startTotpEnrollment(challengeToken),
    enabled: mode === "enroll",
    retry: false,
  });

  if (mode === "enroll") {
    return (
      <AsyncStateView
        isLoading={enrollment.isLoading}
        isError={enrollment.isError}
        error={enrollment.error}
        data={enrollment.data}
        onRetry={() => void enrollment.refetch()}
      >
        {(data) => (
          <VerifyShell locale={locale} challengeToken={challengeToken} mode="enroll" enrollment={data} />
        )}
      </AsyncStateView>
    );
  }

  return <VerifyShell locale={locale} challengeToken={challengeToken} mode="verify" />;
}

function VerifyShell({
  locale,
  challengeToken,
  mode,
  enrollment,
}: {
  locale: Locale;
  challengeToken: string;
  mode: "verify" | "enroll";
  enrollment?: { secret: string; otpauthUri: string };
}) {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CodeFormValues>();

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      if (mode === "enroll") {
        await confirmTotpEnrollment(challengeToken, values.code);
      } else {
        await verifyTotp(challengeToken, values.code);
      }
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      router.replace(`/${locale}`);
    } catch (error) {
      if (error instanceof NetworkError) {
        setSubmitError(t("common.offlineBanner"));
      } else if (error instanceof ApiError) {
        setSubmitError(t("auth.totpError"));
      } else {
        setSubmitError(t("common.errorGeneric"));
      }
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center p-token-8">
      <Card className="w-full max-w-sm">
        <h1 className="text-lg font-semibold text-text-primary">
          {mode === "enroll" ? t("auth.totpEnrollTitle") : t("auth.totpTitle")}
        </h1>
        <p className="mt-token-1 text-sm text-text-secondary">
          {mode === "enroll" ? t("auth.totpEnrollInstructions") : t("auth.totpSubtitle")}
        </p>
        {mode === "enroll" && enrollment ? (
          <div className="mt-token-4 rounded-token border border-border bg-surface-raised p-token-3">
            <p className="text-xs font-medium text-text-secondary">{t("auth.totpEnrollSecretLabel")}</p>
            <p className="mt-token-1 break-all font-mono text-sm text-text-primary">{enrollment.secret}</p>
          </div>
        ) : null}
        <form className="mt-token-6 flex flex-col gap-token-4" onSubmit={onSubmit} noValidate>
          <TextField
            label={t("auth.totpCodeLabel")}
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            error={errors.code ? t("common.requiredField") : undefined}
            {...register("code", { required: true, pattern: /^\d{6}$/ })}
          />
          {submitError ? (
            <p role="alert" className="text-sm text-danger">
              {submitError}
            </p>
          ) : null}
          <Button type="submit" isLoading={isSubmitting} className="w-full">
            {mode === "enroll" ? t("auth.totpEnrollConfirmButton") : t("auth.totpVerifyButton")}
          </Button>
        </form>
      </Card>
    </main>
  );
}
