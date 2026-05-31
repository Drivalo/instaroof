"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  detectPrivacyRegionFromBrowser,
  PRIVACY_REGION_HEADINGS,
  type PrivacyRegion,
} from "@/lib/privacy-region";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="text-lg text-foreground tracking-wide">{title}</h2>
      <div className="mt-3 space-y-3 text-muted leading-relaxed">{children}</div>
    </section>
  );
}

function RegionalBlock({ region }: { region: PrivacyRegion }) {
  const title = PRIVACY_REGION_HEADINGS[region];

  const body: Record<PrivacyRegion, ReactNode> = {
    gdpr: (
      <p>
        <strong className="text-foreground font-medium">Legal basis (GDPR):</strong> We process your
        data on the basis of your explicit consent, given when you submit the contact form. We
        comply with the UK GDPR and EU General Data Protection Regulation.
      </p>
    ),
    australia: (
      <p>
        We comply with the Australian Privacy Act 1988 and the Australian Privacy Principles (APP).
      </p>
    ),
    new_zealand: <p>We comply with the New Zealand Privacy Act 2020.</p>,
    canada: (
      <p>
        We comply with PIPEDA (Personal Information Protection and Electronic Documents Act) and
        applicable provincial privacy legislation.
      </p>
    ),
    california: (
      <p>
        For California residents, we comply with the CCPA (California Consumer Privacy Act). You have
        the right to know what personal information is collected, request deletion, and opt out of
        any sale of personal information. We do not sell personal information.
      </p>
    ),
    us_other: (
      <p>
        We are committed to protecting your personal information in accordance with applicable US
        state privacy laws. We do not sell your personal data. To request access or deletion of your
        data, contact{" "}
        <a href="mailto:hello@nimly.tech" className="text-accent underline-offset-2 hover:underline">
          hello@nimly.tech
        </a>
        .
      </p>
    ),
  };

  return (
    <Section title={title}>
      {body[region]}
    </Section>
  );
}

export function PrivacyPolicyContent() {
  const [region, setRegion] = useState<PrivacyRegion | null>(null);

  useEffect(() => {
    setRegion(detectPrivacyRegionFromBrowser());
  }, []);

  return (
    <article className="max-w-3xl">
      <p className="text-muted leading-relaxed">
        This policy explains how InstaRoof collects and uses your personal information. The section
        for your region is shown based on your browser language settings.
      </p>

      <Section title="Who we are">
        <p>
          InstaRoof is a roofing quote tool operated by Nimly (
          <a href="mailto:hello@nimly.tech" className="text-accent underline-offset-2 hover:underline">
            hello@nimly.tech
          </a>
          ). We help homeowners get instant roof estimates and connect them with local roofing
          professionals.
        </p>
      </Section>

      <Section title="What data we collect">
        <ul className="list-disc pl-5 space-y-2">
          <li>First name</li>
          <li>Email address</li>
          <li>Phone number (optional)</li>
          <li>Property address</li>
          <li>Roof size estimate generated from your address</li>
        </ul>
      </Section>

      <Section title="Why we collect it">
        <p>
          We collect this information solely to generate your roof quote and pass your enquiry to a
          local roofing professional who can follow up with you.
        </p>
      </Section>

      <Section title="Who we share it with">
        <p>
          Your details are shared only with the roofing business you submitted a quote request
          through. We do not sell your data to third parties.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We retain your data for 12 months. After this period it is deleted from our systems.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Depending on your location you have the right to access your data, correct inaccurate data,
          request deletion of your data, and withdraw consent at any time. To exercise any of these
          rights, email us at{" "}
          <a href="mailto:hello@nimly.tech" className="text-accent underline-offset-2 hover:underline">
            hello@nimly.tech
          </a>
          .
        </p>
      </Section>

      <Section title="Data storage">
        <p>Your data is stored securely using Supabase, hosted on AWS infrastructure.</p>
      </Section>

      <Section title="Cookies">
        <p>
          We use essential cookies only to make the application function. We do not use tracking or
          advertising cookies.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          We may update this policy from time to time. The latest version will always be available at{" "}
          <a
            href="https://instaroof.app/privacy"
            className="text-accent underline-offset-2 hover:underline"
          >
            instaroof.app/privacy
          </a>
          .
        </p>
      </Section>

      <Section title="Contact">
        <p>
          <a href="mailto:hello@nimly.tech" className="text-accent underline-offset-2 hover:underline">
            hello@nimly.tech
          </a>
        </p>
      </Section>

      {region ? (
        <RegionalBlock region={region} />
      ) : (
        <div
          className="mt-10 h-24 rounded-lg border border-border-subtle bg-surface animate-pulse"
          aria-hidden
        />
      )}
    </article>
  );
}
