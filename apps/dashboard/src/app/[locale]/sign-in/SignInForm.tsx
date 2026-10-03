"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import type { Locale } from "../../../lib/i18n/locales";
import { useI18n } from "../../../lib/i18n/provider";
import { login } from "../../../lib/auth/api";
import { SESSION_QUERY_KEY, useSession } from "../../../lib/auth/use-session";
import { ApiError, NetworkError } from "../../../lib/api/client";
import { Button } from "../../../components/ui/Button";
import { TextField } from "../../../components/ui/TextField";
import { Card } from "../../../components/ui/Card";
import { LoadingState } from "../../../components/states/LoadingState";
import { OfflineState } from "../../../components/states/OfflineState";

interface FormValues {
  email: string;
  password: string;
}

export function SignInForm({ locale }: { locale: Locale }) {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>();

  // Already signed in — leave this page rather than show a sign-in form again.
  useEffect(() => {
    if (session.isSuccess) {
      router.replace(`/${locale}`);
    }
  }, [session.isSuccess, router, locale]);

  if (session.isSuccess) {
    return <LoadingState />;
  }

  // A genuine connectivity problem (not "no session cookie yet") gets the
  // same offline treatment every other screen gives it.
  if (session.isError && session.error instanceof NetworkError) {
    return <OfflineState />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const result = await login(values.email, values.password);
      if (result.status === "session") {
        await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
        router.replace(`/${locale}`);
        return;
      }
      const mode = result.status === "totp_enrollment_required" ? "enroll" : "verify";
      router.replace(
        `/${locale}/verify?challengeToken=${encodeURIComponent(result.challengeToken)}&mode=${mode}`,
      );
    } catch (error) {
      if (error instanceof NetworkError) {
        setSubmitError(t("common.offlineBanner"));
      } else if (error instanceof ApiError) {
        setSubmitError(t("auth.signInError"));
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
        <h1 className="text-lg font-semibold text-text-primary">{t("auth.signInTitle")}</h1>
        <p className="mt-token-1 text-sm text-text-secondary">{t("auth.signInSubtitle")}</p>
        <form className="mt-token-6 flex flex-col gap-token-4" onSubmit={onSubmit} noValidate>
          <TextField
            label={t("auth.emailLabel")}
            type="email"
            autoComplete="email"
            error={errors.email ? t("common.requiredField") : undefined}
            {...register("email", { required: true })}
          />
          <TextField
            label={t("auth.passwordLabel")}
            type="password"
            autoComplete="current-password"
            error={errors.password ? t("common.requiredField") : undefined}
            {...register("password", { required: true })}
          />
          {submitError ? (
            <p role="alert" className="text-sm text-danger">
              {submitError}
            </p>
          ) : null}
          <Button type="submit" isLoading={isSubmitting} className="w-full">
            {isSubmitting ? t("auth.signInLoading") : t("auth.signInButton")}
          </Button>
        </form>
      </Card>
    </main>
  );
}
