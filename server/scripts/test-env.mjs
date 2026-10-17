// Test accounts come from environment variables, never from the code.
// The repo is public, so no real email or password may be written in a script.

export function influencerFromEnv() {
  const email = process.env.INFLUENCER_EMAIL;
  const password = process.env.INFLUENCER_PASSWORD;

  if (!email || !password) {
    console.error(
      "Set INFLUENCER_EMAIL and INFLUENCER_PASSWORD first. See PROJECT-NOTES.md.",
    );
    process.exit(1);
  }

  return { email, password };
}
