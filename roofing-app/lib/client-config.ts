/**
 * Per-client configuration. In production, load from database or env per tenant.
 * For now, a single hardcoded test client.
 */
export const CLIENT_CONFIG = {
  clientId: "acme-roofing-demo",
  companyName: "Acme Roofing",
  /** Recipient for new-lead notification emails (Resend). */
  notificationEmail: "cherineywong@gmail.com",
} as const;

export function getClientNotificationEmail(): string {
  return process.env.LEAD_NOTIFICATION_EMAIL?.trim() || CLIENT_CONFIG.notificationEmail;
}
