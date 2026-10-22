interface BrandProfileFields {
  companyName?: string | null;
  industry?: string | null;
  location?: string | null;
  socialLinks?: { url?: string | null }[] | null;
}

export function isBrandProfileComplete(profile?: BrandProfileFields | null) {
  return Boolean(
    profile?.companyName?.trim() &&
      profile.industry?.trim() &&
      profile.location?.trim() &&
      profile.socialLinks?.some((link) => link.url?.trim()),
  );
}
