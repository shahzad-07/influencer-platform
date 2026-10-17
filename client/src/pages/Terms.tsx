import { Link } from "react-router-dom";

// ---- Fill these in before launch. They are the only things to edit. ----
const BUSINESS_NAME = "High Cafe";
const CONTACT_EMAIL = "contact@highcafe.com";
const CITY = "New Delhi";
const LAST_UPDATED = "2026-10-17";
// ------------------------------------------------------------------------

interface Section {
  title: string;
  paragraphs: string[];
}

const SECTIONS: Section[] = [
  {
    title: "1. What this platform is",
    paragraphs: [
      `${BUSINESS_NAME} ("we", "the platform") is a marketplace where brands and influencers find each other, chat, agree on a collaboration and track it. We are not a party to any deal. The deal is between the brand and the influencer.`,
      "We do not employ influencers, we are not an agency, and we do not promise any result such as reach, sales or followers.",
    ],
  },
  {
    title: "2. Accounts",
    paragraphs: [
      "You must give true information and keep your password private. You are responsible for what happens under your account.",
      "Each account is either a Brand or an Influencer. You must be old enough to make a binding contract in India.",
    ],
  },
  {
    title: "3. How deals work",
    paragraphs: [
      "A brand sends an offer with a brief. The influencer can accept or decline. An offer stays open for 7 days and then expires.",
      "After acceptance the influencer shares a draft, the brand approves it or asks for changes, the influencer posts and shares the link, and the brand verifies that the post is live. The platform shows each side only the steps that are theirs to take.",
      "Collaborations can be paid, barter (the influencer gets products, services or experiences instead of money) or both. In a barter-only deal no money is recorded in the app. What the influencer gets must be described in the offer, and both sides should treat that description as the agreement.",
      "A deal can be disputed. A disputed deal is frozen until it is resolved.",
    ],
  },
  {
    title: "4. Payments",
    paragraphs: [
      "Payments are made directly between the brand and the influencer, outside the platform, for example by UPI or bank transfer. The platform never holds, moves or guarantees any money.",
      "The platform only records payments. After paying, the brand enters a payment reference (such as a UTR). The influencer then confirms that the money arrived, or says that it did not.",
      "The amounts come from the offer, in rupees. Any taxes, such as GST or TDS, are the responsibility of the brand and the influencer.",
    ],
  },
  {
    title: "5. Payment details",
    paragraphs: [
      "An influencer can save payment details (such as UPI or bank details). They are stored encrypted. They are hidden by default and are shown to a brand only when the influencer chooses to share them for a deal.",
      "A share lasts 6 hours and cannot be extended by the brand. Every time the details are viewed, we log it.",
      "Use the shared details only to pay that deal. Do not copy, keep or pass them on.",
    ],
  },
  {
    title: "6. Content and conduct",
    paragraphs: [
      "You must not post anything unlawful, false, hateful, harassing or that infringes someone's rights. You must not use the platform to send spam, to scam anyone, or to pull people off the platform to avoid its rules.",
      "You must not try to break, overload or get around the security of the platform, for example by guessing passwords or sending automated bulk requests.",
      "You own what you create. By sharing it in a deal you allow the other side to use it as the deal describes. Any further use (such as ads, reposting or exclusivity) must be agreed in the offer or in chat.",
    ],
  },
  {
    title: "7. Advertising disclosure",
    paragraphs: [
      "Influencers must clearly mark paid, gifted and barter posts as advertising or as a partnership, following the rules that apply in India (for example the ASCI influencer guidelines). Brands must not ask an influencer to hide the collaboration.",
    ],
  },
  {
    title: "8. Suspension",
    paragraphs: [
      "We may warn, limit or close an account that breaks these terms or harms other users.",
    ],
  },
  {
    title: "9. Limits of our responsibility",
    paragraphs: [
      "The platform is provided as it is. We do not check the identity, claims, follower numbers or work of any user, and we are not responsible for what users say or do, for a missed payment, or for a deal that goes wrong.",
      "To the extent the law allows, we are not liable for indirect or lost profits, and our total liability to you is limited to the amount you paid us for using the platform, if any.",
    ],
  },
  {
    title: "10. Changes",
    paragraphs: [
      "We may update these terms. The date at the top shows the latest version. If you keep using the platform after a change, you accept the new terms.",
    ],
  },
  {
    title: "11. Governing law",
    paragraphs: [
      `These terms are governed by the laws of India. The courts in ${CITY} have jurisdiction over any dispute about them.`,
    ],
  },
  {
    title: "12. Contact",
    paragraphs: [`Questions about these terms: ${CONTACT_EMAIL}`],
  },
];

export default function Terms() {
  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <p>
        <Link to="/">← Back</Link>
      </p>

      <h1 style={{ marginBottom: 4 }}>Terms of use</h1>
      <p style={{ color: "gray", marginTop: 0 }}>
        {BUSINESS_NAME} · Last updated {LAST_UPDATED}
      </p>

      <p
        style={{
          border: "1px solid #e0a800",
          background: "#fff8e1",
          color: "#333",
          borderRadius: 8,
          padding: 12,
        }}
      >
        <strong>Draft.</strong> These terms have not been reviewed by a lawyer
        yet. They must be reviewed before the platform is launched.
      </p>

      {SECTIONS.map((s) => (
        <section key={s.title}>
          <h2>{s.title}</h2>
          {s.paragraphs.map((p, i) => (
            <p key={i} style={{ overflowWrap: "anywhere" }}>
              {p}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
