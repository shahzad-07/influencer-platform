import { Link } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

// ---- The only things to edit when the business details change. ----
const BUSINESS_NAME = "DealDoneHai";
const CONTACT_EMAIL = "dealdonehai@gmail.com";
const CITY = "Bengaluru";
const LAST_UPDATED = "2026-10-22";
// ------------------------------------------------------------------

interface Section {
  title: string;
  paragraphs: string[];
}

const SECTIONS: Section[] = [
  {
    title: "1. What this platform is",
    paragraphs: [
      `${BUSINESS_NAME} ("we", "the platform") is a marketplace where brands and creators find each other, chat, agree on a collaboration and track it. We are not a party to any deal. The deal is between the brand and the creator.`,
      "We do not employ creators, we are not an agency, and we do not promise any result such as reach, sales or followers.",
    ],
  },
  {
    title: "2. Accounts",
    paragraphs: [
      "You must give true information and keep your password private. You are responsible for what happens under your account.",
      "Each account is either a Brand or a Creator. You must be old enough to make a binding contract in India.",
    ],
  },
  {
    title: "3. How deals work",
    paragraphs: [
      "A brand sends an offer with a brief. The creator can accept or decline. An offer stays open for 7 days and then expires.",
      "After acceptance the creator shares a draft, the brand approves it or asks for changes, the creator posts and shares the link, and the brand verifies that the post is live. The platform shows each side only the steps that are theirs to take.",
      "Collaborations can be paid, barter (the creator gets products, services or experiences instead of money) or both. In a barter-only deal no money is recorded in the app. What the creator gets must be described in the offer, and both sides should treat that description as the agreement.",
      "A deal can be disputed. A disputed deal is frozen until it is resolved.",
    ],
  },
  {
    title: "4. Payments",
    paragraphs: [
      "Payments are made directly between the brand and the creator, outside the platform, for example by UPI or bank transfer. The platform never holds, moves or guarantees any money.",
      "The platform only records payments. After paying, the brand may enter a payment reference (such as a UTR); this is optional. The creator then confirms that the money arrived, or says that it did not.",
      "The amounts come from the offer, in rupees. Any taxes, such as GST or TDS, are the responsibility of the brand and the creator.",
    ],
  },
  {
    title: "5. Payment details",
    paragraphs: [
      "A creator may add payment details (such as UPI or bank details) after signing up, but must save them before accepting a paid offer. They are stored encrypted and hidden by default. For a paid deal, the brand can view them at the relevant payment stage: the advance after acceptance and the final payment after the post is verified as live. Every view is recorded.",
      "Use the payment details only to pay that deal. Do not copy, keep or pass them on.",
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
      "Creators must clearly mark paid, gifted and barter posts as advertising or as a partnership, following the rules that apply in India (for example the ASCI guidelines for influencer advertising). Brands must not ask a creator to hide the collaboration.",
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
    <>
      <SiteHeader />
      <main className="page prose">
        <p>
          <Link to="/">← Back to home</Link>
        </p>

        <h1>Terms of use</h1>
        <p className="muted">
          {BUSINESS_NAME} · Last updated {LAST_UPDATED}
        </p>

        <p className="notice">
          <strong>Draft.</strong> These terms have not been reviewed by a lawyer
          yet. They must be reviewed before the platform is launched.
        </p>

        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2>{s.title}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>
        ))}
      </main>
      <SiteFooter />
    </>
  );
}
