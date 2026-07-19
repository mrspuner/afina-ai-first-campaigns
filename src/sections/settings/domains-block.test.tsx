import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DomainsBlock } from "./domains-block";
import {
  AppStateProvider,
  useAppDispatch,
} from "@/state/app-state-context";
import { DEMO_ACCOUNT_SETTINGS } from "@/types/account-settings";

/**
 * Probe that dispatches the REAL reducer cases to seed
 * `AccountSettings.ownDomains` with all three moderation statuses — the
 * registry is the single source of truth (Task 6/7/9), so tests drive it
 * through actual actions rather than mocking state. `pending` needs no
 * follow-up dispatch (`domain_registered` alone lands unknown domains
 * there); `approved`/`rejected` additionally resolve via
 * `domain_moderation_resolved`, mirroring the real moderation-timer flow
 * (Task 7, `useDomainModeration`).
 */
function SeedOwnDomains({
  pending,
  approved,
  rejected,
}: {
  pending: string;
  approved: string;
  rejected: string;
}) {
  const dispatch = useAppDispatch();
  return (
    <button
      type="button"
      onClick={() => {
        dispatch({ type: "domain_registered", domain: pending });
        dispatch({ type: "domain_registered", domain: approved });
        dispatch({ type: "domain_registered", domain: rejected });
        dispatch({
          type: "domain_moderation_resolved",
          approved: [approved],
          rejected: [rejected],
        });
      }}
    >
      Seed own domains
    </button>
  );
}

function renderBlock() {
  return render(
    <AppStateProvider>
      <DomainsBlock />
      <SeedOwnDomains
        pending="pending-registry-test.ru"
        approved="approved-registry-test.ru"
        rejected="rejected-registry-test.ru"
      />
    </AppStateProvider>
  );
}

describe("DomainsBlock — Собственные домены и исключения (Task 10)", () => {
  afterEach(cleanup);

  it("renders the renamed block heading", () => {
    renderBlock();
    expect(
      screen.getByText("Собственные домены и исключения")
    ).toBeInTheDocument();
  });

  it("shows an empty state for own domains before any are registered", () => {
    renderBlock();
    expect(
      screen.getByText(/Пока нет добавленных доменов/)
    ).toBeInTheDocument();
  });

  it("renders pending/approved/rejected ownDomains entries with the exact RU status labels", () => {
    renderBlock();
    fireEvent.click(screen.getByRole("button", { name: "Seed own domains" }));

    expect(screen.getByText("pending-registry-test.ru")).toBeInTheDocument();
    expect(screen.getByText("approved-registry-test.ru")).toBeInTheDocument();
    expect(screen.getByText("rejected-registry-test.ru")).toBeInTheDocument();

    expect(screen.getByText("На проверке")).toBeInTheDocument();
    expect(screen.getByText("Одобрен")).toBeInTheDocument();
    expect(screen.getByText("Отклонён")).toBeInTheDocument();
  });

  it("keeps the existing global domain-exclusions section intact (add/remove still works)", () => {
    renderBlock();

    expect(screen.getByText("Глобальные исключения")).toBeInTheDocument();
    // DEMO_ACCOUNT_SETTINGS seeds the blocklist — proves it survived the
    // Task 10 restructure rather than being dropped/repurposed.
    for (const domain of DEMO_ACCOUNT_SETTINGS.domainBlocklist) {
      expect(screen.getByText(domain)).toBeInTheDocument();
    }

    const [firstBlocked] = DEMO_ACCOUNT_SETTINGS.domainBlocklist;
    const removeButton = screen.getByRole("button", {
      name: `Убрать ${firstBlocked} из блок-листа`,
    });
    fireEvent.click(removeButton);
    expect(screen.queryByText(firstBlocked)).not.toBeInTheDocument();
  });
});
