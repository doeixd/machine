/**
 * @file Authentication State Machine Example
 * @description Demonstrates all primitives: transitionTo, guarded, invoke, describe, action
 *
 * This example shows a complete authentication flow with:
 * - Login/logout transitions
 * - Session management
 * - Permission guards
 * - Async token refresh
 * - Logging actions
 */

import { MachineBase } from '../src/index';
import { transitionTo, guarded, invoke, describe, action } from '../src/primitives';

// =============================================================================
// CONTEXT TYPES
// =============================================================================

interface LoggedOutContext {
  status: 'loggedOut';
  lastError?: string;
}

interface LoggingInContext {
  status: 'loggingIn';
  username: string;
}

interface LoggedInContext {
  status: 'loggedIn';
  username: string;
  token: string;
  permissions: string[];
  sessionExpiresAt: number;
}

interface SessionExpiredContext {
  status: 'sessionExpired';
  username: string;
  permissions: string[];
}

interface ErrorContext {
  status: 'error';
  error: string;
  previousState: 'loggedOut' | 'loggingIn' | 'loggedIn';
}

// =============================================================================
// STATE MACHINE CLASSES
// =============================================================================

/**
 * Initial state - user is logged out
 */
export class LoggedOutMachine extends MachineBase<LoggedOutContext> {
  constructor(context: LoggedOutContext = { status: 'loggedOut' }) {
    super(context);
  }

  /**
   * Initiate login process
   * Transitions to LoggingIn state to perform async authentication
   */
  login = describe(
    'Start the login process with username and password',
    action(
      { name: 'logLoginAttempt', description: 'Log authentication attempt for analytics' },
      transitionTo(LoggingInMachine, (username: string, _password: string) => {
        return new LoggingInMachine({
          status: 'loggingIn',
          username,
        });
      })
    )
  );
}

/**
 * Intermediate state - authentication in progress
 */
export class LoggingInMachine extends MachineBase<LoggingInContext> {
  constructor(context: LoggingInContext) {
    super(context);
  }

  /**
   * Perform async authentication
   * On success: transition to LoggedIn
   * On error: transition to Error
   */
  authenticate = describe(
    'Perform async authentication with the server',
    invoke(
      {
        src: 'authenticateUser',
        onDone: LoggedInMachine,
        onError: ErrorMachine,
        description: 'Call authentication API and retrieve user session token',
      },
      async () => {
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Simulate successful auth
        const token = 'mock-jwt-token-' + Date.now();
        const permissions = ['read', 'write'];
        const sessionExpiresAt = Date.now() + 3600000; // 1 hour

        return new LoggedInMachine({
          status: 'loggedIn',
          username: this.context.username,
          token,
          permissions,
          sessionExpiresAt,
        });
      }
    )
  );

  /**
   * Cancel login attempt
   */
  cancel = describe(
    'Cancel the login process and return to logged out state',
    action(
      { name: 'logLoginCanceled', description: 'Track canceled login attempts' },
      transitionTo(LoggedOutMachine, () => {
        return new LoggedOutMachine({ status: 'loggedOut' });
      })
    )
  );
}

/**
 * Authenticated state - user has valid session
 */
export class LoggedInMachine extends MachineBase<LoggedInContext> {
  constructor(context: LoggedInContext) {
    super(context);
  }

  /**
   * Log out - clear session and return to logged out state
   */
  logout = describe(
    'Log out the current user and clear session data',
    action(
      { name: 'clearSessionData', description: 'Clear tokens and session from storage' },
      transitionTo(LoggedOutMachine, () => {
        return new LoggedOutMachine({ status: 'loggedOut' });
      })
    )
  );

  /**
   * Delete account - only allowed for users with admin permissions
   */
  deleteAccount = describe(
    'Delete the user account (admin only)',
    guarded(
      {
        name: 'hasAdminPermission',
        description: 'User must have admin permission to delete accounts',
      },
      action(
        { name: 'logAccountDeletion', description: 'Audit log for account deletion' },
        transitionTo(LoggedOutMachine, () => {
          // In real implementation, would check this.context.permissions.includes('admin')
          return new LoggedOutMachine({
            status: 'loggedOut',
            lastError: undefined,
          });
        })
      )
    )
  );

  /**
   * Refresh session token before expiration
   */
  refreshToken = describe(
    'Refresh the authentication token to extend session',
    invoke(
      {
        src: 'refreshAuthToken',
        onDone: LoggedInMachine,
        onError: SessionExpiredMachine,
        description: 'Call token refresh endpoint with current token',
      },
      async () => {
        // Simulate token refresh API call
        await new Promise((resolve) => setTimeout(resolve, 500));

        const newToken = 'refreshed-jwt-token-' + Date.now();
        const newExpiresAt = Date.now() + 3600000; // 1 hour from now

        return new LoggedInMachine({
          ...this.context,
          token: newToken,
          sessionExpiresAt: newExpiresAt,
        });
      }
    )
  );

  /**
   * Session expires naturally (timeout)
   */
  onSessionExpired = describe(
    'Handle session expiration timeout',
    transitionTo(SessionExpiredMachine, () => {
      return new SessionExpiredMachine({
        status: 'sessionExpired',
        username: this.context.username,
        permissions: this.context.permissions,
      });
    })
  );
}

/**
 * Session expired state - token is no longer valid
 */
export class SessionExpiredMachine extends MachineBase<SessionExpiredContext> {
  constructor(context: SessionExpiredContext) {
    super(context);
  }

  /**
   * Re-authenticate with stored credentials
   */
  reAuthenticate = describe(
    'Re-authenticate the user after session expiration',
    transitionTo(LoggingInMachine, (password: string) => {
      return new LoggingInMachine({
        status: 'loggingIn',
        username: this.context.username,
      });
    })
  );

  /**
   * Give up and log out completely
   */
  logout = describe(
    'Log out after session expiration',
    transitionTo(LoggedOutMachine, () => {
      return new LoggedOutMachine({ status: 'loggedOut' });
    })
  );
}

/**
 * Error state - authentication or session errors
 */
export class ErrorMachine extends MachineBase<ErrorContext> {
  constructor(context: ErrorContext) {
    super(context);
  }

  /**
   * Retry the failed operation
   */
  retry = describe(
    'Retry the failed authentication or session operation',
    transitionTo(LoggingInMachine, (username: string) => {
      return new LoggingInMachine({
        status: 'loggingIn',
        username,
      });
    })
  );

  /**
   * Give up and return to logged out state
   */
  dismiss = describe(
    'Dismiss the error and return to logged out state',
    transitionTo(LoggedOutMachine, () => {
      return new LoggedOutMachine({
        status: 'loggedOut',
        lastError: this.context.error,
      });
    })
  );
}

// =============================================================================
// FACTORY FUNCTION (for easier instantiation)
// =============================================================================

/**
 * Create a new authentication machine in the logged out state
 */
export function createAuthMachine(): LoggedOutMachine {
  return new LoggedOutMachine({ status: 'loggedOut' });
}
