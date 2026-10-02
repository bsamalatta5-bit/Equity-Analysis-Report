"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import type { Locale } from "../../../lib/i18n/locales";
import { useI18n } from "../../../lib/i18n/provider";
import { AuthGuard } from "../../../components/auth/AuthGuard";
import type { SessionInfo } from "../../../lib/auth/api";
import { Button } from "../../../components/ui/Button";
import { TextField } from "../../../components/ui/TextField";
import { Card } from "../../../components/ui/Card";
import { ApiError, NetworkError } from "../../../lib/api/client";
import {
  createLocation,
  createPhoneNumber,
  createService,
  createStaffMember,
} from "../../../lib/onboarding/api";

type Step = "location" | "service" | "staff" | "phone" | "complete";

export function OnboardingWizardPage({ locale }: { locale: Locale }) {
  return <AuthGuard locale={locale}>{(session) => <Wizard locale={locale} session={session} />}</AuthGuard>;
}

function Wizard({ locale, session }: { locale: Locale; session: SessionInfo }) {
  const { t } = useI18n();

  if (session.role !== "tenant_owner") {
    return (
      <main id="main-content" className="flex min-h-screen items-center justify-center p-token-8">
        <Card className="max-w-sm text-center text-sm text-text-secondary">
          {t("onboarding.ownerOnlyNotice")}
        </Card>
      </main>
    );
  }

  return <WizardSteps locale={locale} tenantId={session.tenantId} />;
}

function WizardSteps({ locale, tenantId }: { locale: Locale; tenantId: string }) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("location");
  const [locationId, setLocationId] = useState<string | null>(null);

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center p-token-8">
      <Card className="w-full max-w-md">
        <h1 className="text-lg font-semibold text-text-primary">{t("onboarding.wizardTitle")}</h1>
        {step === "location" ? (
          <LocationStep
            tenantId={tenantId}
            onDone={(id) => {
              setLocationId(id);
              setStep("service");
            }}
          />
        ) : null}
        {step === "service" && locationId ? (
          <ServiceStep tenantId={tenantId} locationId={locationId} onDone={() => setStep("staff")} />
        ) : null}
        {step === "staff" && locationId ? (
          <StaffStep tenantId={tenantId} locationId={locationId} onDone={() => setStep("phone")} />
        ) : null}
        {step === "phone" && locationId ? (
          <PhoneStep tenantId={tenantId} locationId={locationId} onDone={() => setStep("complete")} />
        ) : null}
        {step === "complete" ? <CompleteStep locale={locale} /> : null}
      </Card>
    </main>
  );
}

function useStepSubmit<Values>(submit: (values: Values) => Promise<unknown>, onDone: () => void) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const run = async (values: Values) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await submit(values);
      onDone();
    } catch (err) {
      if (err instanceof NetworkError) {
        setError(t("common.offlineBanner"));
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t("common.errorGeneric"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return { error, isSubmitting, run };
}

interface LocationFormValues {
  name: string;
  addressLine: string;
  timezone: string;
}

function LocationStep({ tenantId, onDone }: { tenantId: string; onDone: (locationId: string) => void }) {
  const { t } = useI18n();
  const { register, handleSubmit } = useForm<LocationFormValues>({
    defaultValues: { timezone: "Asia/Riyadh" },
  });
  const { error, isSubmitting, run } = useStepSubmit<LocationFormValues>(
    async (values) => {
      const location = await createLocation(tenantId, values);
      onDone(location.id);
    },
    () => undefined,
  );

  return (
    <StepForm
      title={t("onboarding.stepLocationTitle")}
      onSubmit={handleSubmit(run)}
      error={error}
      isSubmitting={isSubmitting}
    >
      <TextField label={t("onboarding.locationNameLabel")} {...register("name", { required: true })} />
      <TextField
        label={t("onboarding.locationAddressLabel")}
        {...register("addressLine", { required: true })}
      />
      <TextField
        label={t("onboarding.locationTimezoneLabel")}
        {...register("timezone", { required: true })}
      />
    </StepForm>
  );
}

interface ServiceFormValues {
  nameAr: string;
  nameEn: string;
  durationMinutes: number;
  statedPrice: number;
}

function ServiceStep({
  tenantId,
  locationId,
  onDone,
}: {
  tenantId: string;
  locationId: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { register, handleSubmit } = useForm<ServiceFormValues>({
    defaultValues: { durationMinutes: 30, statedPrice: 0 },
  });
  const { error, isSubmitting, run } = useStepSubmit<ServiceFormValues>(
    (values) =>
      createService(tenantId, locationId, {
        ...values,
        durationMinutes: Number(values.durationMinutes),
        statedPrice: Number(values.statedPrice),
      }),
    onDone,
  );

  return (
    <StepForm
      title={t("onboarding.stepServiceTitle")}
      onSubmit={handleSubmit(run)}
      error={error}
      isSubmitting={isSubmitting}
    >
      <TextField
        label={t("onboarding.serviceNameArLabel")}
        dir="rtl"
        {...register("nameAr", { required: true })}
      />
      <TextField label={t("onboarding.serviceNameEnLabel")} {...register("nameEn", { required: true })} />
      <TextField
        label={t("onboarding.serviceDurationLabel")}
        type="number"
        min={5}
        max={480}
        {...register("durationMinutes", { required: true, valueAsNumber: true })}
      />
      <TextField
        label={t("onboarding.servicePriceLabel")}
        type="number"
        min={0}
        step="0.01"
        {...register("statedPrice", { required: true, valueAsNumber: true })}
      />
    </StepForm>
  );
}

interface StaffFormValues {
  displayName: string;
}

function StaffStep({
  tenantId,
  locationId,
  onDone,
}: {
  tenantId: string;
  locationId: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { register, handleSubmit } = useForm<StaffFormValues>();
  const { error, isSubmitting, run } = useStepSubmit<StaffFormValues>(
    (values) => createStaffMember(tenantId, locationId, values),
    onDone,
  );

  return (
    <StepForm
      title={t("onboarding.stepStaffTitle")}
      onSubmit={handleSubmit(run)}
      error={error}
      isSubmitting={isSubmitting}
    >
      <TextField label={t("onboarding.staffNameLabel")} {...register("displayName", { required: true })} />
    </StepForm>
  );
}

interface PhoneFormValues {
  e164Number: string;
  providerReference: string;
}

function PhoneStep({
  tenantId,
  locationId,
  onDone,
}: {
  tenantId: string;
  locationId: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { register, handleSubmit } = useForm<PhoneFormValues>();
  const { error, isSubmitting, run } = useStepSubmit<PhoneFormValues>(
    (values) => createPhoneNumber(tenantId, { locationId, ...values }),
    onDone,
  );

  return (
    <StepForm
      title={t("onboarding.stepPhoneTitle")}
      onSubmit={handleSubmit(run)}
      error={error}
      isSubmitting={isSubmitting}
    >
      <TextField
        label={t("onboarding.phoneNumberLabel")}
        placeholder="+9665XXXXXXXX"
        {...register("e164Number", { required: true })}
      />
      <TextField
        label={t("onboarding.phoneProviderReferenceLabel")}
        {...register("providerReference", { required: true })}
      />
    </StepForm>
  );
}

function CompleteStep({ locale }: { locale: Locale }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <div className="mt-token-6 flex flex-col items-center gap-token-3 text-center">
      <p className="text-base font-semibold text-text-primary">{t("onboarding.completeTitle")}</p>
      <p className="text-sm text-text-secondary">{t("onboarding.completeDescription")}</p>
      <Button onClick={() => router.push(`/${locale}`)}>{t("onboarding.backToHomeButton")}</Button>
    </div>
  );
}

function StepForm({
  title,
  onSubmit,
  error,
  isSubmitting,
  children,
}: {
  title: string;
  onSubmit: (event: FormEvent) => void;
  error: string | null;
  isSubmitting: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <form className="mt-token-6 flex flex-col gap-token-4" onSubmit={onSubmit} noValidate>
      <h2 className="text-sm font-semibold text-text-secondary">{title}</h2>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" isLoading={isSubmitting} className="w-full">
        {t("onboarding.continueButton")}
      </Button>
    </form>
  );
}
