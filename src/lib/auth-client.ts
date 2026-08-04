import { createAuthClient } from "better-auth/react";

/**
 * Browser-side Better Auth client. Used from client components for session-
 * bound actions that must run in the browser — notably sign-out, which needs to
 * clear the TanStack Query cache right after (see the dashboard sign-out
 * control). `baseURL` defaults to the current origin.
 */
export const authClient = createAuthClient();

export const { signOut, useSession } = authClient;
