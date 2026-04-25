import { useEffect } from "react";

/**
 * Keep the browser tab title in sync with the current page.
 *
 * Apply on every route page. Without this, navigating from a page that sets
 * `document.title` to one that doesn't leaves the previous title in place —
 * e.g. going Password → Sessions would keep showing "Change Password".
 *
 * The effect runs on mount and whenever the title prop changes.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

export default useDocumentTitle;
