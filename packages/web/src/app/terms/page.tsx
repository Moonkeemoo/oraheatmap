import type { Metadata } from "next";

import { H2, LI, LegalPage, P, Strong, UL } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service · oralab",
  description: "The rules for using oralab.",
};

const CONTACT_EMAIL = "hello@oralab.xyz";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="May 4, 2026">
      <P>
        These Terms govern your access to and use of the dashboard at <Strong>oralab.xyz</Strong>{" "}
        (the “Service”), provided by oralab (“we”, “our”, “us”). By using the Service you
        agree to these Terms. If you do not agree, do not use the Service.
      </P>

      <H2>What the Service is</H2>
      <P>
        The Service is a real-time visualisation of public Polymarket whale activity built
        from public on-chain trades and Polymarket’s public APIs. It is{" "}
        <Strong>read-only</Strong>: we do not place trades, hold funds, custody assets, or
        execute orders on your behalf. We are not affiliated with, endorsed by, or sponsored
        by Polymarket.
      </P>

      <H2>Not financial advice</H2>
      <P>
        Everything on the Service — heatmap cells, whale profiles, balance growth charts,
        category breakdowns, top markets, alerts — is{" "}
        <Strong>information only</Strong>. It is not investment advice, not a recommendation,
        not a solicitation to buy or sell anything, and not a forecast of any market outcome.
        Prediction markets are speculative; you can lose all the money you put into them.
        Make your own decisions, or consult a qualified professional.
      </P>

      <H2>Eligibility</H2>
      <P>
        You must be at least 18 years old and legally capable of entering into a contract in
        your jurisdiction. You are responsible for ensuring that your use of the Service —
        and any underlying use of Polymarket — is lawful where you are.
      </P>

      <H2>Accounts</H2>
      <P>
        Some features require sign-in via one of the supported providers (Email, MetaMask /
        SIWE, GitHub, Discord, Telegram). You are responsible for the security of the
        account or wallet you sign in with. Notify us promptly if you believe your account
        is compromised.
      </P>

      <H2>Whale data and aliases</H2>
      <P>
        The Service tracks publicly available activity from Polymarket-watched wallet
        addresses. Aliases, X handles, and avatars shown next to wallets are sourced from
        Polymarket’s own public leaderboard data. We do not perform independent
        investigation, doxxing, or off-chain identification. If you are a Polymarket trader
        whose alias appears on the Service and you would like the link removed from our
        display, write to <Strong>{CONTACT_EMAIL}</Strong> and we will remove it on a
        best-effort basis.
      </P>

      <H2>Acceptable use</H2>
      <P>You agree not to:</P>
      <UL>
        <LI>Scrape, crawl, or otherwise bulk-extract data from the Service except via interfaces we explicitly publish for that purpose.</LI>
        <LI>Reverse-engineer, decompile, or attempt to extract source code or models from the Service.</LI>
        <LI>Use the Service to harass, defame, or violate the rights of any whale or user.</LI>
        <LI>Resell, redistribute, or commercially exploit data taken from the Service without our written permission.</LI>
        <LI>Interfere with or disrupt the Service, e.g. by sending automated traffic, denial-of-service attempts, or attempts to bypass authentication / paid tiers.</LI>
        <LI>Use the Service in violation of applicable law, including sanctions and prediction-market regulations in your jurisdiction.</LI>
      </UL>

      <H2>Paid tiers (when offered)</H2>
      <P>
        We may introduce paid features (a “Pro” plan or similar). When we do, additional
        terms describing pricing, billing, refunds, and on-chain payment mechanics will be
        presented at sign-up and incorporated into these Terms. You agree to those additional
        terms by upgrading. Until then, the Service is free, and free features may be added,
        changed, or removed without notice.
      </P>

      <H2>Intellectual property</H2>
      <P>
        We grant you a limited, non-exclusive, non-transferable, revocable license to access
        and use the Service for personal, non-commercial use. The brand “oralab”, our logo,
        UI design, code, copy, and the way we aggregate, score, and visualise whale data
        belong to us. Public on-chain data and Polymarket data are not ours; we display them
        but make no IP claim over them.
      </P>

      <H2>No warranties</H2>
      <P>
        The Service is provided <Strong>“as is”</Strong> and <Strong>“as available”</Strong>{" "}
        without warranties of any kind, express or implied. We do not warrant that the
        Service is accurate, complete, current, uninterrupted, error-free, or fit for any
        particular purpose. Whale tracking can lag, miscategorise, or miss trades;
        Polymarket APIs can change without notice; on-chain data can be re-org’d or restated.
      </P>

      <H2>Limitation of liability</H2>
      <P>
        To the maximum extent permitted by law, oralab and its contributors are not liable
        for any indirect, incidental, special, consequential, exemplary, or punitive damages,
        or for any loss of profits, revenue, data, or trading losses, arising from or related
        to your use of the Service — even if advised of the possibility of such damages. Our
        total aggregate liability for any claim arising from the Service is capped at the
        greater of (a) the amount you paid us in the 12 months before the claim, or (b) USD
        50.
      </P>

      <H2>Indemnification</H2>
      <P>
        You agree to defend and indemnify oralab against any claims, damages, and expenses
        arising from your misuse of the Service, your violation of these Terms, or your
        violation of any law or third-party right.
      </P>

      <H2>Termination</H2>
      <P>
        You can stop using the Service at any time and request account deletion as described
        in our Privacy Policy. We may suspend or terminate your access — with or without
        notice — for breach of these Terms, suspected abuse, or as required by law.
        Sections that by their nature should survive termination (IP, disclaimers, liability
        limits, governing law, indemnification) will survive.
      </P>

      <H2>Governing law</H2>
      <P>
        These Terms are governed by the laws of Ukraine, without regard to its conflict-of-law
        rules. Any dispute will be resolved in the competent courts of Ukraine, except where
        mandatory consumer-protection laws of your country of residence give you a different,
        non-waivable forum.
      </P>

      <H2>Changes</H2>
      <P>
        We may update these Terms as the Service evolves. Material changes will be flagged
        on the dashboard or by email. Continued use after the “Last updated” date changes
        means you accept the updated Terms.
      </P>

      <H2>Contact</H2>
      <P>
        Questions about these Terms: <Strong>{CONTACT_EMAIL}</Strong>.
      </P>
    </LegalPage>
  );
}
