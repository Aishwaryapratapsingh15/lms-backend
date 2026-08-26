import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type NewLeadNotification = {
  id: string;
  fullName: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  assignedToName?: string | null;
};

@Injectable()
export class TeamsNotificationService {
  private readonly logger = new Logger(TeamsNotificationService.name);

  constructor(private readonly config: ConfigService) {}

  private isConfigured() {
    return Boolean(this.config.get<string>('TEAMS_LEAD_WEBHOOK_URL'));
  }

  // Posts through a Teams "Workflows" webhook (Power Automate trigger), not
  // the legacy Office 365 Incoming Webhook connector — the request body is
  // therefore the Teams message envelope with an Adaptive Card attachment,
  // matching the default schema of the built-in "Post to a channel when a
  // webhook request is received" template.
  async notifyNewLead(lead: NewLeadNotification): Promise<void> {
    if (!this.isConfigured()) return;
    const webhookUrl = this.config.get<string>(
      'TEAMS_LEAD_WEBHOOK_URL',
    ) as string;
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const payload = {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.4',
            body: [
              {
                type: 'TextBlock',
                text: '🎯 New Lead',
                weight: 'Bolder',
                size: 'Medium',
                color: 'Accent',
              },
              {
                type: 'TextBlock',
                text: lead.fullName,
                weight: 'Bolder',
                size: 'Large',
                wrap: true,
              },
              {
                type: 'FactSet',
                facts: [
                  { title: 'Company', value: lead.company || '—' },
                  { title: 'Email', value: lead.email || '—' },
                  { title: 'Phone', value: lead.phone || '—' },
                  { title: 'Source', value: lead.source || '—' },
                  {
                    title: 'Assigned to',
                    value: lead.assignedToName || 'Unassigned',
                  },
                ],
              },
            ],
            actions: [
              {
                type: 'Action.OpenUrl',
                title: 'Open in LMS',
                url: `${frontendUrl}/leads/${lead.id}`,
              },
            ],
          },
        },
      ],
    };

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        this.logger.warn(
          `Teams lead notification failed: ${res.status} ${await res.text()}`,
        );
      }
    } catch (err) {
      this.logger.error('Teams lead notification threw', err as Error);
    }
  }
}
