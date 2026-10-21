import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

const DEAL_STEPS = [
  { title: "Offer sent", note: "Terms shown before accepting" },
  { title: "Advance paid and confirmed", note: "Directly, by UPI" },
  { title: "Draft approved", note: "Before it goes live" },
  { title: "Live post verified", note: "Final payment confirmed" },
];

const FAQS = [
  {
    q: "Does DealDoneHai handle the payments?",
    a: "No. The brand pays the creator directly, for example by UPI or bank transfer. The creator then confirms that the money arrived.",
  },
  {
    q: "What is a barter deal?",
    a: "The creator receives a product or service instead of money. There are no payment steps, and the deal completes once the live post is verified.",
  },
  {
    q: "Who can see a creator's rates?",
    a: "Only brands. Rates are never shown to other creators.",
  },
  {
    q: "Is it free?",
    a: "It is free to start. We will tell you before anything changes.",
  },
];

export default function Landing() {
  const [side, setSide] = useState<"brand" | "creator">("brand");

  // Links like /#faq from other pages: scroll to the section once the page is ready
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  return (
    <>
      <SiteHeader />

      <main id="main">
        <div className="container hero-wrap" id="top">
          <section className="hero">
            <div>
              <h1>
                <span>Brands meet creators.</span>
                <span>Deals get done.</span>
              </h1>
              <p className="hero-lead">
                DealDoneHai is where brands find creators and close paid or
                barter collaborations, with every term agreed before the work
                starts. Free to start.
              </p>
              <div className="hero-cta">
                <Link className="btn btn-lime" to="/signup?role=brand">
                  Sign up as a brand
                </Link>
                <Link className="btn btn-line" to="/signup?role=creator">
                  Sign up as a creator
                </Link>
              </div>
              <p className="hero-note">
                Already have an account? <Link to="/login">Log in</Link>
              </p>
            </div>

            <div className="ticket" aria-label="Sample deal">
              <div className="ticket-top">
                <span>Sample deal</span>
                <span className="chip">Paid + barter</span>
              </div>
              <h3>Reel for our new menu</h3>
              <p className="ticket-parties">
                Chai Lane Café and Aarav, a food creator in Bengaluru
              </p>
              <div className="ticket-pay">
                <strong>₹8,000 + dinner for two</strong>
                <span>50% advance, the rest after the post is verified</span>
              </div>
              <ol className="steps">
                {DEAL_STEPS.map((s) => (
                  <li key={s.title}>
                    <span className="tick">
                      <svg
                        viewBox="0 0 14 14"
                        fill="none"
                        stroke="#fff"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 7.3l2.7 2.7L11 4.4" />
                      </svg>
                    </span>
                    <div>
                      <b>{s.title}</b>
                      <small>{s.note}</small>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="stamp" aria-hidden="true">
                Deal done
                <br />
                hai
              </div>
            </div>
          </section>
        </div>

        <section className="section" id="how">
          <div className="container">
            <h2>From first message to finished deal</h2>
            <div className="how">
              <div>
                <h3>Find each other</h3>
                <p>
                  Brands search creators by niche, city and language. Creators
                  can message brands first.
                </p>
              </div>
              <div>
                <h3>Agree the terms</h3>
                <p>
                  The offer shows the type, amount, advance and deadline, so the
                  creator knows what to expect before saying yes.
                </p>
              </div>
              <div>
                <h3>Deliver and get paid</h3>
                <p>
                  Share the draft, post it, verify the link. Payments go
                  directly between you, and the creator confirms each one.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="section who" id="who">
          <div className="container">
            <h2>Made for both sides of the deal</h2>
            <div
              className="switch"
              role="tablist"
              aria-label="Choose your side"
            >
              <button
                type="button"
                role="tab"
                id="tab-brand"
                aria-selected={side === "brand"}
                aria-controls="p-brand"
                onClick={() => setSide("brand")}
              >
                I'm a brand
              </button>
              <button
                type="button"
                role="tab"
                id="tab-creator"
                aria-selected={side === "creator"}
                aria-controls="p-creator"
                onClick={() => setSide("creator")}
              >
                I'm a creator
              </button>
            </div>

            <div
              className="who-panel"
              id="p-brand"
              role="tabpanel"
              aria-labelledby="tab-brand"
              hidden={side !== "brand"}
            >
              <h3>Find the right creator and keep every deal in one place.</h3>
              <div>
                <ul>
                  <li>Search by niche, city and language</li>
                  <li>See portfolios and rates before you reach out</li>
                  <li>Offer paid, barter or both</li>
                  <li>Track every deal from offer to final payment</li>
                </ul>
                <Link className="btn btn-primary" to="/signup?role=brand">
                  Sign up as a brand
                </Link>
              </div>
            </div>

            <div
              className="who-panel"
              id="p-creator"
              role="tabpanel"
              aria-labelledby="tab-creator"
              hidden={side !== "creator"}
            >
              <h3>Show your work, know the terms and confirm every payment.</h3>
              <div>
                <ul>
                  <li>
                    Build a profile with your niches, languages and past work
                  </li>
                  <li>Set your rates. Only brands can see them</li>
                  <li>See the payment terms before you accept</li>
                  <li>Confirm each payment, or say it did not arrive</li>
                </ul>
                <Link className="btn btn-primary" to="/signup?role=creator">
                  Sign up as a creator
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="why">
          <div className="container">
            <h2>Why brands and creators use DealDoneHai</h2>
            <div className="adv">
              <div>
                <h3>We never hold your money</h3>
                <p>
                  Brand and creator pay each other directly. We record the
                  payment, and the creator confirms it arrived.
                </p>
              </div>
              <div>
                <h3>Clear terms, clear steps</h3>
                <p>
                  Every offer shows what is due and when. Both sides see the
                  same status and history.
                </p>
              </div>
              <div>
                <h3>Your details stay protected</h3>
                <p>
                  Rates are visible to brands only. Payment details are
                  encrypted and shown to the brand at the relevant payment
                  stage, with every view logged.
                </p>
              </div>
              <div>
                <h3>Works on any screen</h3>
                <p>Search, chat and manage deals on a phone or a laptop.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="faq" style={{ paddingTop: 0 }}>
          <div className="container">
            <h2>Questions, answered</h2>
            <div className="faq">
              {FAQS.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <div className="container">
          <section className="band">
            <h2>Ready to get your next deal done?</h2>
            <p>
              Create your account in a minute. Pick the side you are on and
              start.
            </p>
            <div className="band-cta">
              <Link className="btn btn-dark" to="/signup?role=brand">
                Sign up as a brand
              </Link>
              <Link className="btn btn-outline-dark" to="/signup?role=creator">
                Sign up as a creator
              </Link>
            </div>
          </section>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
