export interface GitHubUser {
  id: number;
  login: string;
  created_at: string;
  public_repos: number;
}

export interface OAuthClient {
  verify(code: string): Promise<{
    user: GitHubUser;
    publicEventsCount: number;
    // INV-14 (renegotiated): the token is handed back for IN-MEMORY use during
    // this same request (authenticated Proof-of-Passion scoring) and is never
    // persisted, logged, or returned to the client. It dies with the request.
    accessToken: string;
  }>;
}

export function createOAuthClient(
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch = fetch,
): OAuthClient {
  async function verify(code: string) {
    const tokenRes = await fetchImpl(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      },
    );

    if (!tokenRes.ok) {
      throw new Error(
        `GitHub token exchange failed: ${tokenRes.status}`,
      );
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      throw new Error(
        `GitHub OAuth error: ${tokenData.error ?? "no token"}`,
      );
    }

    const accessToken = tokenData.access_token;

    let user: GitHubUser;
    let publicEventsCount = 0;
    {
      const userRes = await fetchImpl("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!userRes.ok) {
        throw new Error(
          `GitHub user fetch failed: ${userRes.status}`,
        );
      }

      const raw = (await userRes.json()) as {
        id: number;
        login: string;
        created_at: string;
        public_repos: number;
      };

      user = {
        id: raw.id,
        login: raw.login,
        created_at: raw.created_at,
        public_repos: raw.public_repos,
      };

      if (raw.public_repos < 3) {
        const eventsRes = await fetchImpl(
          `https://api.github.com/users/${raw.login}/events/public?per_page=100`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/vnd.github.v3+json",
            },
          },
        );

        if (eventsRes.ok) {
          const events = (await eventsRes.json()) as Array<{
            created_at: string;
          }>;
          const ninetyDaysAgo = new Date();
          ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
          publicEventsCount = events.filter(
            (e) => new Date(e.created_at) > ninetyDaysAgo,
          ).length;
        }
      }
    }

    // INV-14 (renegotiated): return the token for same-request authenticated
    // scoring only. The caller must not persist or log it.
    return { user, publicEventsCount, accessToken };
  }

  return { verify };
}

export function checkEligibility(
  user: GitHubUser,
  publicEventsCount: number,
): { eligible: boolean; reason?: string } {
  const created = new Date(user.created_at);
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);

  if (created > sixMonthsAgo) {
    return {
      eligible: false,
      reason: "Account must be at least 6 months old",
    };
  }

  if (user.public_repos >= 3) {
    return { eligible: true };
  }

  if (publicEventsCount >= 5) {
    return { eligible: true };
  }

  return {
    eligible: false,
    reason: `Account must have at least 3 public repos or 5+ public events in 90 days (has ${user.public_repos} repos, ${publicEventsCount} events)`,
  };
}
