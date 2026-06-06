/**
 * Per-client configuration. In production, load from database or env per tenant.
 * For now, a single hardcoded test client.
 */
export const CLIENT_CONFIG = {
  clientId: "roofcapture-demo",
  companyName: "Your Roofing Company",
  /** Recipient for new-lead notification emails (Resend). */
  notificationEmail: "hello@nimly.tech",
} as const;

export function getClientNotificationEmail(): string {
  return process.env.LEAD_NOTIFICATION_EMAIL?.trim() || CLIENT_CONFIG.notificationEmail;
}
