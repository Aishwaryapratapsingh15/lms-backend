import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type FollowUpEventInput = {
  userEmail: string;
  subject: string;
  body: string;
  start: Date;
  durationMinutes?: number;
  isOnlineMeeting?: boolean;
};

type SyncResult = {
  eventId: string | null;
  joinUrl: string | null;
  error: string | null;
};

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  // Sales/Admin accounts live on Microsoft 365, not Google, so events are
  // pushed via app-only Graph credentials (tenant admin consent) rather than
  // a per-user OAuth connect flow.
  private isConfigured() {
    return Boolean(
      this.config.get<string>('MS_GRAPH_TENANT_ID') &&
        this.config.get<string>('MS_GRAPH_CLIENT_ID') &&
        this.config.get<string>('MS_GRAPH_CLIENT_SECRET'),
    );
  }

  private async getAccessToken(): Promise<string | null> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 30_000) {
      return this.cachedToken.value;
    }
    const tenantId = this.config.get<string>('MS_GRAPH_TENANT_ID');
    const clientId = this.config.get<string>('MS_GRAPH_CLIENT_ID');
    const clientSecret = this.config.get<string>('MS_GRAPH_CLIENT_SECRET');

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId as string,
      client_secret: clientSecret as string,
      scope: 'https://graph.microsoft.com/.default',
    });

    try {
      const res = await fetch(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        },
      );
      if (!res.ok) {
        this.logger.error(
          `Failed to obtain Microsoft Graph token: ${res.status} ${await res.text()}`,
        );
        return null;
      }
      const data = (await res.json()) as {
        access_token: string;
        expires_in: number;
      };
      this.cachedToken = {
        value: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };
      return this.cachedToken.value;
    } catch (err) {
      this.logger.error('Microsoft Graph token request threw', err as Error);
      return null;
    }
  }

  private toGraphDateTime(date: Date) {
    return date.toISOString().slice(0, 19);
  }

  async createFollowUpEvent(input: FollowUpEventInput): Promise<SyncResult> {
    if (!this.isConfigured()) return { eventId: null, joinUrl: null, error: null };
    const token = await this.getAccessToken();
    if (!token)
      return {
        eventId: null,
        joinUrl: null,
        error: 'Could not authenticate with Microsoft Graph',
      };

    const end = new Date(
      input.start.getTime() + (input.durationMinutes ?? 30) * 60_000,
    );

    try {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(input.userEmail)}/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            subject: input.subject,
            body: { contentType: 'text', content: input.body },
            start: { dateTime: this.toGraphDateTime(input.start), timeZone: 'UTC' },
            end: { dateTime: this.toGraphDateTime(end), timeZone: 'UTC' },
            isReminderOn: true,
            reminderMinutesBeforeStart: 30,
            // Asking Graph for a Teams meeting here (rather than calling the
            // separate /onlineMeetings endpoint) attaches the join link
            // directly onto this same calendar event/invite.
            ...(input.isOnlineMeeting
              ? { isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' }
              : {}),
          }),
        },
      );
      if (!res.ok) {
        const errText = await res.text();
        this.logger.warn(
          `Graph event creation failed for ${input.userEmail}: ${res.status} ${errText}`,
        );
        return {
          eventId: null,
          joinUrl: null,
          error: `Graph API error ${res.status}`,
        };
      }
      const created = (await res.json()) as {
        id: string;
        onlineMeeting?: { joinUrl?: string } | null;
      };
      return {
        eventId: created.id,
        joinUrl: created.onlineMeeting?.joinUrl ?? null,
        error: null,
      };
    } catch (err) {
      this.logger.error(
        `Graph event creation threw for ${input.userEmail}`,
        err as Error,
      );
      return { eventId: null, joinUrl: null, error: (err as Error).message };
    }
  }

  // Used by the polling reconciliation job to detect a reschedule/cancel
  // made directly in Outlook/Teams. Returns null for a 404 — a single
  // (non-recurring) event's "cancel" in Outlook is the same as deleting it,
  // so a missing event and a cancelled one are indistinguishable and treated
  // the same way by callers.
  async getEvent(
    userEmail: string,
    eventId: string,
  ): Promise<{ start: Date } | null> {
    if (!this.isConfigured()) return null;
    const token = await this.getAccessToken();
    if (!token) return null;
    try {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/events/${eventId}?$select=start,isCancelled`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status === 404) return null;
      if (!res.ok) {
        this.logger.warn(
          `Graph event lookup failed for ${userEmail}/${eventId}: ${res.status}`,
        );
        return null;
      }
      const event = (await res.json()) as {
        isCancelled?: boolean;
        start?: { dateTime: string };
      };
      if (event.isCancelled || !event.start) return null;
      // Graph returns start.dateTime without a timezone suffix when the
      // event's timeZone field is UTC (as ours always is) — appending "Z"
      // keeps this from being misparsed as local time.
      return { start: new Date(`${event.start.dateTime}Z`) };
    } catch (err) {
      this.logger.error(
        `Graph event lookup threw for ${userEmail}/${eventId}`,
        err as Error,
      );
      return null;
    }
  }

  async deleteEvent(userEmail: string, eventId: string): Promise<void> {
    if (!this.isConfigured()) return;
    const token = await this.getAccessToken();
    if (!token) return;
    try {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/events/${eventId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok && res.status !== 404) {
        this.logger.warn(
          `Graph event deletion failed for ${userEmail}/${eventId}: ${res.status}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Graph event deletion threw for ${userEmail}/${eventId}`,
        err as Error,
      );
    }
  }
}
