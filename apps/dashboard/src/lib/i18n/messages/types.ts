/**
 * The canonical message shape. `en.ts` and `ar.ts` both declare
 * `satisfies Messages`, so a key present in one locale and missing from the
 * other is a type error, not a silent runtime fallback.
 */
export interface Messages {
  common: {
    appName: string;
    loading: string;
    retry: string;
    cancel: string;
    save: string;
    delete: string;
    close: string;
    confirm: string;
    back: string;
    next: string;
    submit: string;
    offlineBanner: string;
    errorGeneric: string;
    emptyGeneric: string;
    requiredField: string;
    skipToContent: string;
    languageSwitcherLabel: string;
    mainNavigationLabel: string;
  };
  auth: {
    signInTitle: string;
    signInSubtitle: string;
    emailLabel: string;
    passwordLabel: string;
    signInButton: string;
    signInError: string;
    signInLoading: string;
    totpTitle: string;
    totpSubtitle: string;
    totpCodeLabel: string;
    totpVerifyButton: string;
    totpError: string;
    totpEnrollTitle: string;
    totpEnrollInstructions: string;
    totpEnrollSecretLabel: string;
    totpEnrollConfirmButton: string;
    signOutButton: string;
  };
  nav: {
    operations: string;
    calendar: string;
    calls: string;
    knowledgeBase: string;
    services: string;
    staff: string;
    escalationRules: string;
    locations: string;
    users: string;
    usage: string;
    settings: string;
  };
  home: {
    welcomeTitle: string;
    signedInAs: string;
    onboardingPrompt: string;
  };
  onboarding: {
    wizardTitle: string;
    stepLocationTitle: string;
    stepServiceTitle: string;
    stepStaffTitle: string;
    stepPhoneTitle: string;
    locationNameLabel: string;
    locationAddressLabel: string;
    locationTimezoneLabel: string;
    serviceNameArLabel: string;
    serviceNameEnLabel: string;
    serviceDurationLabel: string;
    servicePriceLabel: string;
    staffNameLabel: string;
    phoneNumberLabel: string;
    phoneProviderReferenceLabel: string;
    continueButton: string;
    finishButton: string;
    completeTitle: string;
    completeDescription: string;
    backToHomeButton: string;
    ownerOnlyNotice: string;
  };
  operations: {
    title: string;
    locationLabel: string;
    todayAppointmentsTitle: string;
    noAppointmentsToday: string;
    recentCallsTitle: string;
    noCallsYet: string;
    usageTitle: string;
    billableMinutesLabel: string;
    includedMinutesLabel: string;
    viewCalendarLink: string;
  };
  appointment: {
    calendarTitle: string;
    newAppointmentButton: string;
    detailTitle: string;
    statusPending: string;
    statusConfirmed: string;
    statusCancelled: string;
    statusCompleted: string;
    statusNoShow: string;
    markCompletedButton: string;
    markNoShowButton: string;
    cancelButton: string;
    newAppointmentTitle: string;
    serviceLabel: string;
    staffLabel: string;
    dateLabel: string;
    timeSlotLabel: string;
    selectServiceFirst: string;
    noOpenSlots: string;
    contactPhoneLabel: string;
    contactNameLabel: string;
    createButton: string;
    createdNotice: string;
    backToCalendarButton: string;
    maskedPhoneLabel: string;
  };
}
