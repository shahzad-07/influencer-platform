import { Link } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

// Review these business details with a lawyer before publishing this policy.
const BUSINESS_NAME = "DealDoneHai";
const CONTACT_EMAIL = "dealdonehai@gmail.com";
const LAST_UPDATED = "2026-10-25";

interface Section {
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

const SECTIONS: Section[] = [
  {
    title: "1. Who we are and who this applies to",
    paragraphs: [
      BUSINESS_NAME + ' ("we", "us", or "the platform") operates a service that helps brands and creators discover one another, communicate, and manage collaboration deals. This draft applies when you visit or use the website and related services.',
      "The legal name and address of the operator, and the appropriate grievance contact, must be confirmed before this policy is treated as final.",
    ],
  },
  {
    title: "2. Information we handle",
    paragraphs: ["Depending on how you use the service, we may handle:"],
    bullets: [
      "Account information: your name, email address, account role, password hash, account status, and account timestamps.",
      "Profile information: biography, location, industry, website, social account links and follower counts, languages, niches, portfolio links, and profile image.",
      "Deal and campaign information: offers and briefs, collaboration terms, amounts, barter descriptions, deal status and history, schedules, applications, and campaign preferences.",
      "Messages and service activity: chat messages, notifications, dispute reasons and reviews, trust-mark decisions, account administration records, and payment-detail access audit events.",
      "Payment workflow information: deal amounts and payment stages, whether a payment was reported or confirmed, optional payment references, and creator payment details. Creator payment details are encrypted at rest by the application; they are revealed to the relevant brand only at an authorized payment stage for that deal.",
      "Draft submissions: links and metadata for uploaded draft videos, such as file type, size, version, and submission time. Draft videos are stored in a private storage bucket; the current upload limit is 1 MB. A link can be submitted instead of a video.",
      "Basic technical and operational information processed by our hosting, database, storage, and security services. The specific logs, their retention periods, and vendor processing locations need confirmation before publication.",
    ],
  },
  {
    title: "3. Why we use information",
    paragraphs: ["We use information to:"],
    bullets: [
      "create and secure accounts, authenticate users, and enforce account restrictions;",
      "show profiles and campaigns, connect participants, and operate chat, notifications, scheduling, deals, and draft review;",
      "record payment progress without receiving, holding, or transferring the money between participants;",
      "protect payment details, investigate disputes, keep administrative audit records, and prevent misuse;",
      "operate, maintain, troubleshoot, and improve the service, and meet applicable legal obligations.",
    ],
  },
  {
    title: "4. What other users can see",
    paragraphs: [
      "Profile information and campaign details are shown to users as needed for discovery and collaboration. Deal participants can see the deal information and messages relevant to them. A brand can access a creator's saved payment details only for that brand's paid deal and only at the payment stage authorized by the service.",
      "An admin-reviewed trust mark may show an anonymous count of unresolved payment or deliverable issues on a profile. The public count does not show the other participant's name or the amount. Dispute and review details remain restricted to the participants and authorized administrators.",
    ],
  },
  {
    title: "5. Service providers and sharing",
    paragraphs: [
      "We use service providers to run the platform, including Render for hosting, MongoDB Atlas for the database, and Supabase Storage for uploaded profile images and draft videos. These providers process information to provide their services to us. Their applicable privacy terms and the locations where they process data should be reviewed and confirmed before this draft is finalized.",
      "We do not operate a payment gateway. Brands and creators arrange payment directly with one another outside the platform. We do not disclose information to advertisers for their independent marketing through the features currently implemented.",
      "We may disclose information when required by law, to respond to a lawful request, to protect users or the service, or as part of a business transfer, subject to applicable law.",
    ],
  },
  {
    title: "6. Storage, security, and retention",
    paragraphs: [
      "We use measures intended to protect information, including password hashing, access controls, encrypted creator payment details, private draft-video storage, and signed time-limited access for draft playback. No online service can promise absolute security.",
      "Draft videos associated with completed, cancelled, declined, or expired deals are scheduled for cleanup after 30 days. Other account, deal, message, payment, dispute, audit, backup, and technical-log retention periods have not yet been finalized and must be confirmed before this policy is published as final.",
      "Suspending or soft-removing an account blocks access but currently retains its existing deal, payment, chat, and audit history. Contact us to request review of account information or deletion; we will assess the request under applicable law and explain any records that must be retained.",
    ],
  },
  {
    title: "7. Your choices and requests",
    paragraphs: [
      "You can update profile information through the platform. For questions or requests about access, correction, withdrawal of consent, deletion, or a grievance, contact " +
        CONTACT_EMAIL +
        " from the email address associated with your account. We may need to verify your request before acting. Applicable legal rights and exceptions will be explained in the final lawyer-reviewed policy.",
      "Email verification and email-based password recovery are not yet available in the service. Do not send passwords or payment credentials by email.",
    ],
  },
  {
    title: "8. Children",
    paragraphs: [
      "The service is intended for people able to enter into a binding agreement under applicable Indian law. It is not designed for children. If you believe a child has provided personal information, contact us so we can review the situation.",
    ],
  },
  {
    title: "9. Changes and contact",
    paragraphs: [
      "We may revise this policy as the service or applicable requirements change. The date at the top indicates when this draft was last updated.",
      "Privacy questions and requests: " +
        CONTACT_EMAIL +
        ". The operator's legal name, postal address, and grievance contact must be added after confirmation.",
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <>
      <SiteHeader />
      <main className="page prose">
        <p>
          <Link to="/">← Back to home</Link>
        </p>

        <h1>Privacy policy</h1>
        <p className="muted">
          {BUSINESS_NAME} · Draft · Last updated {LAST_UPDATED}
        </p>

        <p className="notice">
          <strong>Draft for review.</strong> This is a product-based working
          draft, not legal advice or a statement of legal compliance. A lawyer
          must review it, and the operator identity, grievance contact, vendor
          processing locations, and retention periods must be confirmed before
          it is presented as final.
        </p>

        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
            {section.bullets && (
              <ul>
                {section.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </main>
      <SiteFooter />
    </>
  );
}
