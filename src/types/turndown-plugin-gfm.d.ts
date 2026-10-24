/** Type declarations for turndown-plugin-gfm, which ships none. */
declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";

  /** All GitHub Flavored Markdown conversions: tables, strikethrough, task lists and highlighted code blocks. */
  export const gfm: TurndownService.Plugin;
  export const tables: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const taskListItems: TurndownService.Plugin;
  export const highlightedCodeBlock: TurndownService.Plugin;
}
