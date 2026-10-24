/**
 * The handshake between the isolated content script and a page-world script
 * that reads a reply's source list. The content script dispatches
 * {@link REFERENCES_EVENT} on the reply element; DOM events reach listeners in
 * both worlds synchronously, so by the time `dispatchEvent` returns, the page
 * script has written the list as JSON to {@link REFERENCES_ATTRIBUTE} on the
 * same element, or left it unset when it found nothing. Kept in its own module
 * so neither side's bundle pulls in the other.
 */
export const REFERENCES_EVENT = "acf:request-references";
export const REFERENCES_ATTRIBUTE = "data-acf-references";

/** One source as the page script hands it over; the content script validates it again before use. */
export interface RawReference {
  url: string;
  title: string;
  cited: boolean;
  /** Set when the site itself leaves the source out of its source list. */
  hidden: boolean;
}
