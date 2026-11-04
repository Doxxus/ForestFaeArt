/** The pages the owner can edit. Matches CONTENT_KEYS in the API. */
export const CONTENT_KEYS = ["about", "home_teaser", "contact", "privacy", "terms"] as const;

export const PAGE_HELP: Record<(typeof CONTENT_KEYS)[number], { label: string; where: string; picture: boolean }> = {
  about: { label: "About", where: "The About page: your story and how you work.", picture: true },
  home_teaser: { label: "Home page welcome", where: "A short welcome on the home page.", picture: false },
  contact: { label: "Contact page", where: "A short note above the contact form.", picture: false },
  privacy: { label: "Privacy Policy", where: "The Privacy Policy page.", picture: false },
  terms: { label: "Terms of Use", where: "The Terms page.", picture: false },
};
