import type { Metadata } from "next";

import { H2, LI, LegalPage, P, Strong, UL } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy · oralab",
  description: "How oralab handles personal data.",
};

const CONTACT_EMAIL = "hello@oralab.xyz";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="May 4, 2026">
      <P>
        This Privacy Policy describes how oralab (“we”, “our”, “us”) collects, uses,
        and protects personal data when you use the dashboard at <Strong>oralab.xyz</Strong>{" "}
        (the “Service”). We aim to keep this readable and short. If anything is unclear,
        write to us at <Strong>{CONTACT_EMAIL}</Strong>.
      </P>

      <H2>Who we are</H2>
      <P>
        oralab is an independent project run from Ukraine and hosted in the European Union
        (Hetzner, Germany). The Service is a real-time visualisation of public Polymarket
        on-chain trading activity. We are not affiliated with Polymarket.
      </P>

      <H2>What data we collect</H2>
      <P>We only collect what we need to operate the Service:</P>
      <UL>
        <LI>
          <Strong>Account data — only if you sign in.</Strong> Depending on the provider you
          choose, this includes one or more of: email address (Email magic link via Resend),
          Ethereum wallet address (Sign-In with Ethereum / MetaMask), GitHub user ID and
          public profile (username, avatar, verified email), Discord user ID and public
          profile, or Telegram user ID, username, and avatar URL.
        </LI>
        <LI>
          <Strong>Session data.</Strong> A signed cookie (JWT) used to keep you logged in.
          We do not use third-party analytics cookies, and we do not run advertising trackers.
        </LI>
        <LI>
          <Strong>Server logs.</Strong> Standard request logs (IP address, user agent, path,
          status, timestamp), retained for up to 30 days for operational and abuse-prevention
          purposes.
        </LI>
        <LI>
          <Strong>Product preferences.</Strong> If you sign in, we store your dashboard
          preferences (e.g. row order) on the server so they follow you across devices.
        </LI>
      </UL>
      <P>
        We do <Strong>not</Strong> collect government IDs, payment-card data, or biometric
        data. We do not buy or sell personal data.
      </P>

      <H2>What we do not do with on-chain data</H2>
      <P>
        The Service displays public Polymarket trade data and aliases that Polymarket itself
        publishes through its public APIs (e.g. its leaderboard usernames, X handles, and
        verified flags). On-chain wallet activity is public by design; aggregating it does
        not turn it into private data. If you are a Polymarket user whose alias appears on
        the Service and you would like that link removed from our display, contact us at{" "}
        <Strong>{CONTACT_EMAIL}</Strong>.
      </P>

      <H2>Why we use it</H2>
      <P>Lawful bases under the GDPR:</P>
      <UL>
        <LI>
          <Strong>Performance of the contract</Strong> with you (running the dashboard, keeping
          you signed in, saving your preferences).
        </LI>
        <LI>
          <Strong>Legitimate interests</Strong> in operating the Service securely and preventing
          abuse (server logs, rate-limiting, fraud detection).
        </LI>
        <LI>
          <Strong>Your consent</Strong>, where required, e.g. for transactional emails about
          your account.
        </LI>
      </UL>

      <H2>Subprocessors</H2>
      <P>
        We share the minimum data necessary with vetted third-party providers acting on our
        behalf:
      </P>
      <UL>
        <LI>
          <Strong>Hetzner Online GmbH</Strong> — primary hosting (servers, database). Data
          processed in Germany.
        </LI>
        <LI>
          <Strong>Resend</Strong> — transactional email delivery for magic-link sign-in.
        </LI>
        <LI>
          <Strong>GitHub, Discord, Telegram</Strong> — only when you choose those sign-in
          methods. They receive a sign-in request from us and return basic profile data.
        </LI>
      </UL>
      <P>
        Polymarket and the Polygon blockchain are <Strong>data sources</Strong>, not data
        processors — we read public information from them and do not send them anything about
        you.
      </P>

      <H2>Where data is stored</H2>
      <P>
        Account data, sessions, and product preferences are stored on servers in Germany (EU).
        Some subprocessors (e.g. GitHub, Discord) may process limited account data outside
        the EU under standard contractual clauses or equivalent safeguards.
      </P>

      <H2>Retention</H2>
      <UL>
        <LI>Account data: until you delete your account, plus up to 30 days in backups.</LI>
        <LI>Session cookies: until you sign out or the JWT expires.</LI>
        <LI>Server logs: up to 30 days.</LI>
      </UL>

      <H2>Your rights</H2>
      <P>
        If you are in the EU/UK or another jurisdiction with comparable rights, you may
        request to: access your data, correct it, delete it, restrict or object to processing,
        receive a portable copy, or withdraw consent at any time. To exercise any of these,
        email <Strong>{CONTACT_EMAIL}</Strong> from the address associated with your account.
        You also have the right to lodge a complaint with your local data-protection authority.
      </P>

      <H2>Children</H2>
      <P>
        The Service is not intended for users under 18, and we do not knowingly collect data
        from children. If you believe a child has signed in, contact us and we will delete
        the account.
      </P>

      <H2>Changes</H2>
      <P>
        We may update this policy as the Service evolves. Material changes will be flagged
        on the dashboard or by email. The “Last updated” date at the top reflects the
        current version.
      </P>

      <H2>Contact</H2>
      <P>
        Questions, requests, or complaints: <Strong>{CONTACT_EMAIL}</Strong>.
      </P>
    </LegalPage>
  );
}
