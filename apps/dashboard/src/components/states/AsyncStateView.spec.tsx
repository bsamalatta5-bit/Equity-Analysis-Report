import type { ReactElement } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "../../lib/i18n/provider";
import { ApiError, NetworkError } from "../../lib/api/client";
import { AsyncStateView } from "./AsyncStateView";

function renderWithProvider(ui: ReactElement) {
  return render(<I18nProvider locale="en">{ui}</I18nProvider>);
}

describe("AsyncStateView", () => {
  afterEach(() => {
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  });

  it("renders the loading state while isLoading is true", () => {
    renderWithProvider(
      <AsyncStateView isLoading isError={false} data={undefined}>
        {() => <div>success</div>}
      </AsyncStateView>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });

  it("renders a generic error with a retry button on a non-network error", () => {
    const onRetry = vi.fn();
    renderWithProvider(
      <AsyncStateView isLoading={false} isError error={new Error("boom")} data={undefined} onRetry={onRetry}>
        {() => <div>success</div>}
      </AsyncStateView>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    screen.getByRole("button", { name: "Retry" }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders the API error's own message when the error is an ApiError", () => {
    renderWithProvider(
      <AsyncStateView
        isLoading={false}
        isError
        error={
          new ApiError(404, { code: "NOT_FOUND", message: "Appointment not found.", correlationId: "x" })
        }
        data={undefined}
      >
        {() => <div>success</div>}
      </AsyncStateView>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Appointment not found.");
  });

  it("renders the offline state when the error is a NetworkError", () => {
    renderWithProvider(
      <AsyncStateView
        isLoading={false}
        isError
        error={new NetworkError(new Error("fetch failed"))}
        data={undefined}
      >
        {() => <div>success</div>}
      </AsyncStateView>,
    );
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it("renders the offline state when the browser reports offline, even mid-load", () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    renderWithProvider(
      <AsyncStateView isLoading isError={false} data={undefined}>
        {() => <div>success</div>}
      </AsyncStateView>,
    );
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it("renders the empty state when data is undefined and nothing is loading or erroring", () => {
    renderWithProvider(
      <AsyncStateView isLoading={false} isError={false} data={undefined}>
        {() => <div>success</div>}
      </AsyncStateView>,
    );
    expect(screen.getByText("There's nothing here yet.")).toBeInTheDocument();
  });

  it("renders the empty state when isEmpty(data) is true", () => {
    renderWithProvider(
      <AsyncStateView isLoading={false} isError={false} data={[]} isEmpty={(d) => d.length === 0}>
        {() => <div>success</div>}
      </AsyncStateView>,
    );
    expect(screen.getByText("There's nothing here yet.")).toBeInTheDocument();
  });

  it("renders children with the data on success", () => {
    renderWithProvider(
      <AsyncStateView isLoading={false} isError={false} data={{ name: "Clinic" }}>
        {(data) => <div>{data.name}</div>}
      </AsyncStateView>,
    );
    expect(screen.getByText("Clinic")).toBeInTheDocument();
  });
});
